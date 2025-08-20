import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import redisClient from '@/utils/redis';

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

// Redis key constants
const TRENDING_REFRESH_LOCK = 'news:trending:refresh:lock';
const TRENDING_LAST_REFRESH = 'news:trending:last_refresh';
const LOCK_TTL = 300; // 5 minutes in seconds

// Function to check if the cache is stale and needs refreshing
async function shouldRefreshCache(metadata: TrendingNewsMetadata): Promise<boolean> {
  // If we have no metadata or missing critical fields, we need a refresh
  if (!metadata || !metadata.last_updated || !metadata.next_update) {
    console.log('No valid metadata found, refresh needed');
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
    console.log(`Trending news data is extremely stale (${hoursSinceNextUpdate.toFixed(2)} hours past scheduled update). Triggering emergency refresh.`);
    return true;
  } else if (now > nextUpdate) {
    console.log(`Trending news data is stale (${hoursSinceNextUpdate.toFixed(2)} hours past scheduled update), but not triggering refresh. Waiting for cron job.`);
    return false;
  }
  
  return false;
}

// Function to acquire a Redis lock
async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  try {
    // Use Upstash Redis set with NX option (only set if key doesn't exist)
    // Upstash Redis returns "OK" if the key was set (lock acquired)
    const result = await redisClient.set(lockKey, '1', {
      nx: true,
      ex: ttlSeconds
    });
    
    return result === "OK";
  } catch (redisError) {
    console.warn(`Redis lock acquisition failed for ${lockKey}:`, redisError);
    // ARCHITECTURAL FIX: Treat Redis connectivity failures as unlocked state
    // This prevents silent failures that leave data stale when Redis is down
    // Instead of blocking refresh, we allow it to proceed when Redis is unavailable
    return true; // Treat as unlocked to allow refresh to proceed
  }
}

// Function to release a Redis lock
async function releaseLock(lockKey: string): Promise<void> {
  try {
    await redisClient.del(lockKey);
  } catch (redisError) {
    console.warn(`Redis lock release failed for ${lockKey}:`, redisError);
    // Don't throw - lock will expire automatically
  }
}

// Function to trigger the cron job manually
async function triggerCacheRefresh(): Promise<void> {
  // Check if last refresh was within the last 5 minutes
  let lastRefreshTimeStr: string | null = null;
  try {
    lastRefreshTimeStr = await redisClient.get(TRENDING_LAST_REFRESH) as string | null;
  } catch (redisError) {
    console.warn('Redis read error for last refresh time:', redisError);
    // Continue without cache check
  }
  
  const now = Date.now();
  
  if (lastRefreshTimeStr) {
    const lastRefreshTime = parseInt(lastRefreshTimeStr, 10);
    if (now - lastRefreshTime < 5 * 60 * 1000) {
      console.log('Cache refresh completed recently. Skipping new request.');
      return;
    }
  }

  // Try to acquire the lock
  const lockAcquired = await acquireLock(TRENDING_REFRESH_LOCK, LOCK_TTL);
  if (!lockAcquired) {
    console.log('Cache refresh already in progress. Skipping new request.');
    return;
  }
  
  try {
    // Update the last refresh time
    try {
      await redisClient.set(TRENDING_LAST_REFRESH, now.toString());
    } catch (redisError) {
      console.warn('Failed to update last refresh time in Redis:', redisError);
      // Continue with cache refresh even if Redis write fails
    }
    
    // Determine the base URL for the API
    // For Next.js App Router, we can use absolute URLs that will be resolved on the server
    // Prefer explicit app URL. Avoid raw VERCEL_URL to prevent SSO interception on Vercel domains
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    if (!baseUrl) {
      // Safe production fallback
      if (process.env.NODE_ENV === 'production') {
        baseUrl = 'https://app.askclera.com';
      } else {
        baseUrl = 'http://localhost:3000';
      }
    }
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    
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
  } finally {
    // Release the lock after completion or error
    // The lock will expire automatically after TTL, but we release it explicitly for cleaner resource management
    await releaseLock(TRENDING_REFRESH_LOCK);
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