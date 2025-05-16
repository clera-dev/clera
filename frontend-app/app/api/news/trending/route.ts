import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Type for our cached news format
interface CachedNewsItem {
  id: string;
  article_id: string;
  title: string;
  url: string;
  published_at: string;
  source: string;
  banner_image: string;
  summary: string;
  sentiment_score: number;
  sentiment_label: string;
  topics: string[];
}

interface TrendingNewsMetadata {
  id: number;
  last_updated: string | null;
  next_update: string | null;
}

// Function to check if the cache is stale and needs refreshing
async function shouldRefreshCache(metadata: TrendingNewsMetadata): Promise<boolean> {
  if (!metadata || !metadata.last_updated || !metadata.next_update) {
    return true;
  }
  
  const nextUpdate = new Date(metadata.next_update);
  const now = new Date();
  
  return now > nextUpdate;
}

// Function to trigger the cron job manually
async function triggerCacheRefresh(): Promise<void> {
  try {
    // Get the base URL from env variable or use current origin if in browser
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const cronUrl = `${baseUrl}/api/cron/update-trending-news`;
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set');
      return;
    }
    
    console.log(`Manually triggering cache refresh via ${cronUrl}`);
    
    const response = await fetch(cronUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to trigger cache refresh: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    console.log('Cache refresh triggered successfully');
  } catch (error) {
    console.error('Error triggering cache refresh:', error);
    // We don't throw here, as we still want to return whatever is in the cache
  }
}

// Main handler for the API route
export async function GET(request: Request) {
  try {
    // Initialize Supabase client (createClient already handles cookies internally)
    const supabase = await createClient();
    
    // Get metadata to check if we need to refresh
    const { data: metadataData, error: metadataError } = await supabase
      .from('trending_news_metadata')
      .select('*')
      .eq('id', 1)
      .single();
      
    if (metadataError && metadataError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching trending news metadata:', metadataError);
    }
    
    const metadata = metadataData as TrendingNewsMetadata;
    
    // Check if we need to refresh the cache
    if (await shouldRefreshCache(metadata)) {
      console.log('Cache is stale, triggering refresh');
      await triggerCacheRefresh();
      // Note: We don't wait for the refresh to complete, as it may take some time
      // Instead, we return the current cache and let the cron job update it in the background
    }
    
    // Fetch cached news articles - strict limit of 7
    const { data: articles, error: articlesError } = await supabase
      .from('cached_trending_news')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(7);
      
    if (articlesError) {
      console.error('Error fetching trending news articles:', articlesError);
      throw new Error(`Error fetching trending news: ${articlesError.message}`);
    }
    
    // Return the cached news articles
    return NextResponse.json({ 
      articles: articles || [],
      last_updated: metadata?.last_updated || null,
      next_update: metadata?.next_update || null
    });
  } catch (error: any) {
    console.error('Error serving trending news:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
} 