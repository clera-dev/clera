import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import redisClient from '@/utils/redis';

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

// Redis key constants
const WATCHLIST_REFRESH_LOCK = 'news:watchlist:refresh:lock';
const WATCHLIST_LAST_REFRESH = 'news:watchlist:last_refresh';
const LOCK_TTL = 600; // 10 minutes in seconds

// Function to check if the cache is stale and needs refreshing
async function shouldRefreshCache(metadata: WatchlistNewsMetadata): Promise<boolean> {
  // If we have no metadata or missing critical fields, we need a refresh
  if (!metadata || !metadata.last_updated || !metadata.next_update) {
    console.log('No valid watchlist metadata found, refresh needed');
    return true;
  }
  
  const nextUpdate = new Date(metadata.next_update);
  const now = new Date();
  
  // Calculate how many hours have passed since the scheduled update time
  const millisecondsSinceNextUpdate = now.getTime() - nextUpdate.getTime();
  const hoursSinceNextUpdate = millisecondsSinceNextUpdate / (1000 * 60 * 60);
  
  // Only trigger user-initiated refresh if data is extremely stale (24+ hours)
  // This ensures normal refreshes happen only through scheduled cron jobs
  const isExtremelyStale = hoursSinceNextUpdate > 24;
  
  if (isExtremelyStale) {
    console.log(`Watchlist news data is extremely stale (${hoursSinceNextUpdate.toFixed(2)} hours past scheduled update). Triggering emergency refresh.`);
    return true;
  } else if (now > nextUpdate) {
    console.log(`Watchlist news data is stale (${hoursSinceNextUpdate.toFixed(2)} hours past scheduled update), but not triggering refresh. Waiting for cron job.`);
    return false;
  }
  
  return false;
}

// Function to acquire a Redis lock
async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  // Use Upstash Redis set with NX option (only set if key doesn't exist)
  const result = await redisClient.set(lockKey, '1', {
    nx: true,
    ex: ttlSeconds
  });
  return result === 'OK';
}

// Function to release a Redis lock
async function releaseLock(lockKey: string): Promise<void> {
  await redisClient.del(lockKey);
}

// Function to trigger the cron job manually
async function triggerCacheRefresh(): Promise<void> {
  // Check if last refresh was within the last 10 minutes
  const lastRefreshTimeStr = await redisClient.get(WATCHLIST_LAST_REFRESH) as string | null;
  const now = Date.now();
  
  if (lastRefreshTimeStr) {
    const lastRefreshTime = parseInt(lastRefreshTimeStr, 10);
    if (now - lastRefreshTime < 10 * 60 * 1000) {
      console.log('Watchlist refresh completed recently. Skipping new request.');
      return;
    }
  }

  // Try to acquire the lock
  const lockAcquired = await acquireLock(WATCHLIST_REFRESH_LOCK, LOCK_TTL);
  if (!lockAcquired) {
    console.log('Watchlist refresh already in progress. Skipping new request.');
    return;
  }
  
  try {
    // Update the last refresh time
    await redisClient.set(WATCHLIST_LAST_REFRESH, now.toString());
    
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
  } finally {
    // Release the lock after completion or error
    // The lock will expire automatically after TTL, but we release it explicitly for cleaner resource management
    await releaseLock(WATCHLIST_REFRESH_LOCK);
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