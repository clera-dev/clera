import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Type for our watchlist news item
interface WatchlistNewsItem {
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
  category: string;
  logo_url: string;
}

interface WatchlistNewsMetadata {
  id: number;
  last_updated: string | null;
  next_update: string | null;
}

// List of all available sectors
const allSectors = [
  "globalMarkets", "crypto", "commodities", "fixedIncome", "forex",
  "energy", "financials", "healthcare", "technology", "consumer",
  "realEstate", "esg", "macroeconomic"
];

// Function to check if the cache is stale and needs refreshing
async function shouldRefreshCache(metadata: WatchlistNewsMetadata): Promise<boolean> {
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
    // Make sure we have a proper base URL with http/https
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      baseUrl = 'http://localhost:3000';
    }
    
    // Ensure the URL has a proper protocol
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
    const cronUrl = `${baseUrl}/api/cron/update-watchlist-news`;
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set');
      return;
    }
    
    console.log(`Manually triggering watchlist news cache refresh via ${cronUrl}`);
    
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
    
    console.log('Watchlist news cache refresh triggered successfully');
  } catch (error) {
    console.error('Error triggering watchlist news cache refresh:', error);
    // We don't throw here, as we still want to return whatever is in the cache
  }
}

// Main API route handler
export async function GET(request: Request) {
  try {
    // Initialize Supabase client
    const supabase = await createClient();
    
    // Get query parameters
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    
    // Get metadata to check if we need to refresh
    const { data: metadataData, error: metadataError } = await supabase
      .from('watchlist_news_metadata')
      .select('*')
      .eq('id', 1)
      .single();
      
    if (metadataError && metadataError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error fetching watchlist news metadata:', metadataError);
    }
    
    const metadata = metadataData as WatchlistNewsMetadata;
    
    // Check if we need to refresh the cache
    if (await shouldRefreshCache(metadata)) {
      console.log('Watchlist news cache is stale, triggering refresh');
      await triggerCacheRefresh();
      // Note: We don't wait for the refresh to complete, as it may take some time
      // Instead, we return the current cache and let the cron job update it in the background
    }
    
    // Prepare the query for watchlist news articles
    let query = supabase
      .from('watchlist_cached_news')
      .select('*')
      .order('published_at', { ascending: false });
    
    // If a specific category is requested, filter by that category
    if (category && allSectors.includes(category)) {
      query = query.eq('category', category);
    }
    
    // Execute the query
    const { data: articles, error: articlesError } = await query;
    
    if (articlesError) {
      console.error('Error fetching watchlist news articles:', articlesError);
      throw new Error(`Error fetching watchlist news: ${articlesError.message}`);
    }
    
    // Group articles by category
    const articlesByCategory: Record<string, any[]> = {};
    
    // Initialize all categories with empty arrays
    allSectors.forEach(sector => {
      articlesByCategory[sector] = [];
    });
    
    // Populate with actual articles
    (articles || []).forEach(article => {
      if (article.category && articlesByCategory[article.category]) {
        // Limit to 4 articles per category (per user requirements)
        if (articlesByCategory[article.category].length < 4) {
          articlesByCategory[article.category].push({
            title: article.title,
            url: article.url,
            published_at: article.published_at,
            source: article.source,
            banner_image: article.banner_image,
            summary: article.summary,
            sentiment_score: article.sentiment_score,
            sentiment_label: article.sentiment_label,
            category: article.category,
            logo_url: article.logo_url
          });
        }
      }
    });
    
    // Return the watchlist news articles grouped by category
    return NextResponse.json({ 
      categories: articlesByCategory,
      last_updated: metadata?.last_updated || null,
      next_update: metadata?.next_update || null
    });
  } catch (error: any) {
    console.error('Error serving watchlist news:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
} 