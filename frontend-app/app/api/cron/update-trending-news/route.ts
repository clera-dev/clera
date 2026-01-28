import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types for Massive (formerly Polygon.io) API response
// Docs: https://massive.com/docs/rest/stocks/news
// ============================================================================

interface MassiveNewsItem {
  id: string;
  title: string;
  article_url: string;
  author: string;
  published_utc: string;
  image_url?: string;
  description?: string;
  keywords?: string[];
  tickers: string[];
  amp_url?: string;
  publisher: {
    name: string;
    homepage_url: string;
    logo_url: string;
    favicon_url: string;
  };
  insights?: Array<{
    ticker: string;
    sentiment: string;
    sentiment_reasoning: string;
  }>;
}

interface MassiveResponse {
  results: MassiveNewsItem[];
  next_url?: string;
  request_id?: string;
  count?: number;
  status?: string;
}

// Type for our cached news format (matches existing database schema)
interface CachedNewsItem {
  id: string;
  title: string;
  url: string;
  published_at: string;
  source: string;
  banner_image: string;
  summary: string;
  sentiment_score: number;
  sentiment_label: string;
  topics: string[];
  logo_url?: string; // Publisher logo for better visuals
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert Massive sentiment string to numeric score
 */
function sentimentToScore(sentiment: string): number {
  switch (sentiment?.toLowerCase()) {
    case 'positive': return 0.5;
    case 'very_positive': return 0.8;
    case 'negative': return -0.5;
    case 'very_negative': return -0.8;
    case 'neutral': return 0;
    default: return 0;
  }
}

/**
 * Convert numeric sentiment score to label
 */
function scoreToLabel(score: number): string {
  if (score >= 0.5) return 'bullish';
  if (score >= 0.1) return 'somewhat_bullish';
  if (score <= -0.5) return 'bearish';
  if (score <= -0.1) return 'somewhat_bearish';
  return 'neutral';
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Fetch trending market news from Massive (formerly Polygon.io)
 * Using the new api.massive.com endpoint
 */
async function fetchTrendingNews(): Promise<CachedNewsItem[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    throw new Error('POLYGON_API_KEY environment variable is not configured');
  }

  // Calculate date filter for recent news (last 7 days for more variety)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateFilter = sevenDaysAgo.toISOString().split('T')[0];

  // Query: SPY (S&P 500 ETF) news for high-quality market commentary
  // Why SPY: Returns actual market analysis and commentary, not boilerplate press releases
  // Compared to general query which returns 80% repetitive fund notifications
  // SPY news includes: market trends, economic analysis, earnings impact, sector movements
  // We fetch 25 to ensure enough unique articles after deduplication
  // Use api.polygon.io - confirmed working (Massive rebrand is frontend only, API endpoint unchanged)
  const url = `https://api.polygon.io/v2/reference/news?ticker=SPY&limit=25&sort=published_utc&order=desc&published_utc.gte=${dateFilter}&apiKey=${apiKey}`;

  console.log(`[TrendingNews] Fetching from Massive API: ${url.replace(apiKey, '***')}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0)'
      }
    });

    if (response.status === 429) {
      console.error('[TrendingNews] Rate limited by Massive API (5 req/min on free tier)');
      throw new Error('Rate limited by Massive API. Please wait and try again.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TrendingNews] Massive API error: ${response.status} - ${errorText}`);
      throw new Error(`Massive API error: ${response.status} ${response.statusText}`);
    }

    const data: MassiveResponse = await response.json();

    if (!data.results || data.results.length === 0) {
      console.warn('[TrendingNews] Massive API returned no results');
      return [];
    }

    console.log(`[TrendingNews] Received ${data.results.length} articles from Polygon`);

    // Transform and filter: prioritize articles with real images (not just publisher logos)
    const transformedArticles = data.results.map((item, index) => {
      // Calculate sentiment from insights if available
      let sentimentScore = 0;
      if (item.insights && item.insights.length > 0) {
        const scores = item.insights.map(i => sentimentToScore(i.sentiment));
        sentimentScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      }

      // Extract topics from tickers and keywords
      const topics: string[] = [];
      if (item.tickers && item.tickers.length > 0) {
        topics.push(...item.tickers.slice(0, 3)); // Add up to 3 tickers as topics
      }
      if (item.keywords && item.keywords.length > 0) {
        topics.push(...item.keywords.slice(0, 2)); // Add up to 2 keywords
      }

      // Check if image_url is different from publisher logo (indicates a real article image)
      const hasRealImage = item.image_url && 
        item.publisher?.logo_url && 
        item.image_url !== item.publisher.logo_url;

      return {
        id: `trending-${Date.now()}-${index}`,
        title: item.title,
        url: item.article_url,
        published_at: item.published_utc,
        source: item.publisher?.name || 'Unknown',
        banner_image: item.image_url || '',
        summary: item.description || '',
        sentiment_score: sentimentScore,
        sentiment_label: scoreToLabel(sentimentScore),
        topics: topics.slice(0, 5),
        logo_url: item.publisher?.logo_url || '',
        _hasRealImage: hasRealImage // Temp flag for sorting
      };
    }) as (CachedNewsItem & { _hasRealImage: boolean })[];

    // Sort: articles with real images first, then by publish date
    transformedArticles.sort((a, b) => {
      if (a._hasRealImage && !b._hasRealImage) return -1;
      if (!a._hasRealImage && b._hasRealImage) return 1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

    // Deduplicate: remove articles with identical or near-identical titles
    // For SPY news, we use lighter deduplication since articles are higher quality
    const seenTitleKeys = new Set<string>();
    const deduplicatedArticles = transformedArticles.filter(article => {
      // Normalize title: lowercase, remove punctuation, trim
      const normalizedTitle = article.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Use first 60 chars as key (catches true duplicates but allows similar articles)
      const titleKey = normalizedTitle.substring(0, 60);
      
      if (seenTitleKeys.has(titleKey)) {
        return false; // Duplicate, skip
      }
      
      seenTitleKeys.add(titleKey);
      return true;
    });

    // Take top 7 unique articles and remove temp flag
    const articles: CachedNewsItem[] = deduplicatedArticles.slice(0, 7).map(({ _hasRealImage, ...article }) => article);

    // Log results for debugging
    const withImages = articles.filter(a => a.banner_image && a.banner_image !== a.logo_url).length;
    console.log(`[TrendingNews] Selected ${articles.length} articles (${withImages} with real images)`);
    if (articles.length > 0) {
      console.log(`[TrendingNews] First article: "${articles[0].title.substring(0, 50)}..." image: ${articles[0].banner_image?.substring(0, 50)}...`);
    }

    return articles;

  } catch (error: any) {
    console.error('[TrendingNews] Error fetching from Massive:', error.message);
    throw error;
  }
}

/**
 * Calculate the next update time (6AM or 12PM PST)
 */
function calculateNextUpdateTime(): Date {
  const now = new Date();
  
  // Convert to PST (UTC-8)
  const pstOffset = -8;
  const nowPST = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + (pstOffset * 60 * 60 * 1000));
  
  const hourPST = nowPST.getHours();
  
  let nextUpdate: Date;
  
  if (hourPST < 6) {
    // Next update at 6AM PST today
    nextUpdate = new Date(nowPST);
    nextUpdate.setHours(6, 0, 0, 0);
  } else if (hourPST < 12) {
    // Next update at 12PM PST today
    nextUpdate = new Date(nowPST);
    nextUpdate.setHours(12, 0, 0, 0);
  } else {
    // Next update at 6AM PST tomorrow
    nextUpdate = new Date(nowPST);
    nextUpdate.setDate(nextUpdate.getDate() + 1);
    nextUpdate.setHours(6, 0, 0, 0);
  }
  
  // Convert back to UTC for storage
  return new Date(nextUpdate.getTime() - (pstOffset * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
}

/**
 * Update watchlist news metadata (keeps both in sync)
 */
async function updateWatchlistNewsMetadata(supabase: any, nextUpdate: Date): Promise<void> {
  try {
    const { error: tableCheckError } = await supabase
      .from('watchlist_news_metadata')
      .select('id')
      .limit(1);
    
    if (tableCheckError && tableCheckError.code === '42P01') {
      console.log('[TrendingNews] Watchlist news tables not yet created, skipping metadata update');
      return;
    }
    
    const { error: metadataError } = await supabase
      .from('watchlist_news_metadata')
      .upsert({
        id: 1,
        last_updated: new Date().toISOString(),
        next_update: nextUpdate.toISOString()
      });
      
    if (metadataError) {
      console.error('[TrendingNews] Error updating watchlist news metadata:', metadataError);
    } else {
      console.log(`[TrendingNews] Updated watchlist news metadata with next update at ${nextUpdate.toISOString()}`);
    }
  } catch (error) {
    console.error('[TrendingNews] Error in updateWatchlistNewsMetadata:', error);
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(request: Request) {
  // Check for authorization - bypass in development
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!isDevelopment) {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
    
    if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  try {
    // Create Supabase client with service role for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[TrendingNews] Supabase URL or Service Role Key is not defined');
      return NextResponse.json({ error: 'Supabase configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch trending news from Massive API
    console.log('[TrendingNews] Starting news fetch from Massive API...');
    const articles = await fetchTrendingNews();
    
    if (articles.length === 0) {
      console.warn('[TrendingNews] No articles returned from API');
      return NextResponse.json({ 
        success: false, 
        message: 'No articles available from Massive API',
        count: 0 
      });
    }
    
    // Clear existing cached news
    const { error: deleteError } = await supabase
      .from('cached_trending_news')
      .delete()
      .not('id', 'is', null);
      
    if (deleteError) {
      console.error('[TrendingNews] Error clearing existing cached news:', deleteError);
      throw new Error(`Error clearing existing news: ${deleteError.message}`);
    }
    
    console.log(`[TrendingNews] Inserting ${articles.length} articles into database`);
    
    // Insert new articles
    const { error: insertError } = await supabase
      .from('cached_trending_news')
      .insert(articles.map(article => ({
        article_id: article.id,
        title: article.title,
        url: article.url,
        published_at: article.published_at,
        source: article.source,
        banner_image: article.banner_image,
        summary: article.summary,
        sentiment_score: article.sentiment_score,
        sentiment_label: article.sentiment_label,
        topics: article.topics
        // Note: logo_url would need to be added to database schema if we want to store it
      })));
        
    if (insertError) {
      console.error('[TrendingNews] Error inserting new articles:', insertError);
      throw new Error(`Error inserting new articles: ${insertError.message}`);
    }
    
    // Update metadata
    const nextUpdate = calculateNextUpdateTime();
    const { error: metadataError } = await supabase
      .from('trending_news_metadata')
      .update({
        last_updated: new Date().toISOString(),
        next_update: nextUpdate.toISOString()
      })
      .eq('id', 1);
      
    if (metadataError) {
      console.error('[TrendingNews] Error updating trending news metadata:', metadataError);
    }
    
    // Sync watchlist metadata
    await updateWatchlistNewsMetadata(supabase, nextUpdate);
    
    const response = { 
      success: true, 
      message: 'Trending news updated successfully from Massive API', 
      count: articles.length,
      next_update: nextUpdate.toISOString(),
      has_images: articles.filter(a => a.banner_image).length
    };
    
    console.log(`[TrendingNews] Complete: ${JSON.stringify(response)}`);
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('[TrendingNews] Error updating trending news:', error);
    return NextResponse.json({ 
      error: error.message || 'Unknown error',
      source: 'Massive API'
    }, { status: 500 });
  }
}
