/**
 * Watchlist News Service
 * 
 * Shared service for fetching and caching watchlist news from Polygon.io API.
 * Used by batch cron jobs to handle Polygon's 5 requests/minute rate limit.
 * 
 * ARCHITECTURE:
 * - Split into two batches to respect API rate limits
 * - Batch 1: Priority sectors (user defaults + first half)
 * - Batch 2: Remaining sectors
 * - Each batch runs as separate cron job with staggered schedules
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface PolygonNewsItem {
  id: string;
  publisher: {
    name: string;
    homepage_url: string;
    logo_url: string;
    favicon_url: string;
  };
  title: string;
  author: string;
  published_utc: string;
  article_url: string;
  tickers: string[];
  image_url: string;
  description: string;
  keywords: string[];
  insights: Array<{
    ticker: string;
    sentiment: string;
    sentiment_reasoning: string;
  }>;
}

export interface PolygonResponse {
  results: PolygonNewsItem[];
  next_url: string;
  request_id: string;
  count: number;
  status: string;
}

export interface WatchlistNewsItem {
  id: string;
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

export interface BatchResult {
  success: boolean;
  batch: number;
  sectors_processed: string[];
  articles_count: number;
  sector_breakdown: Record<string, number>;
  execution_time_seconds: number;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// Mapping of UI categories to newsworthy tickers
// Using popular stocks that generate regular news coverage
export const categoryToTickerMap: Record<string, string> = {
  // Priority sectors (user defaults + high-traffic)
  'globalMarkets': 'SPY',     // S&P 500 ETF
  'technology': 'AAPL',       // Apple - high news volume
  'crypto': 'COIN',           // Coinbase
  'financials': 'BAC',        // Bank of America
  'healthcare': 'JNJ',        // Johnson & Johnson
  'macroeconomic': 'MSFT',    // Microsoft
  'commodities': 'XOM',       // ExxonMobil
  
  // Secondary sectors
  'energy': 'CVX',            // Chevron
  'consumer': 'WMT',          // Walmart
  'fixedIncome': 'JPM',       // JPMorgan
  'forex': 'GS',              // Goldman Sachs
  'realEstate': 'PLD',        // Prologis - largest REIT, more news coverage
  'esg': 'TSLA',              // Tesla
};

// Batch definitions - split to respect 5 requests/minute limit
// Each batch should have ≤5 sectors to complete within rate limits
export const BATCH_1_SECTORS = [
  'globalMarkets', 'technology', 'crypto', 'financials', 'healthcare'
];

export const BATCH_2_SECTORS = [
  'macroeconomic', 'commodities', 'energy', 'consumer', 'fixedIncome'
];

export const BATCH_3_SECTORS = [
  'forex', 'realEstate', 'esg'
];

// All sectors for reference
export const ALL_SECTORS = Object.keys(categoryToTickerMap);

// API Configuration
const API_DELAY_MS = 12000;         // 12 seconds between calls (5 calls/min = 1 call/12sec)
const RETRY_DELAY_MS = 15000;       // 15 seconds for retry
const MAX_RETRIES = 1;
const ARTICLES_PER_SECTOR = 4;

// ============================================================================
// Utilities
// ============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sentimentToScore(sentiment: string): number {
  switch (sentiment.toLowerCase()) {
    case 'positive': return 0.5;
    case 'very_positive': return 0.8;
    case 'negative': return -0.5;
    case 'very_negative': return -0.8;
    case 'neutral': return 0;
    default: return 0;
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create Supabase client with service role for admin operations
 */
export function createSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Fetch news for a single sector from Polygon.io
 */
export async function fetchNewsForSector(
  sector: string,
  apiKey: string
): Promise<WatchlistNewsItem[]> {
  const ticker = categoryToTickerMap[sector];
  if (!ticker) {
    console.warn(`[WatchlistService] No ticker mapping for sector: ${sector}`);
    return [];
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateFilter = sevenDaysAgo.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=${ARTICLES_PER_SECTOR}&sort=published_utc&order=desc&published_utc.gte=${dateFilter}&apiKey=${apiKey}`;

  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0)' }
      });

      if (response.status === 429) {
        console.warn(`[WatchlistService] Rate limited on ${sector}, attempt ${retryCount + 1}`);
        if (retryCount < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          retryCount++;
          continue;
        }
        return [];
      }

      if (!response.ok) {
        console.error(`[WatchlistService] API error for ${sector}: ${response.status}`);
        return [];
      }

      const data: PolygonResponse = await response.json();

      if (!data.results || data.results.length === 0) {
        console.log(`[WatchlistService] No results for ${sector}`);
        return [];
      }

      return data.results.map((item, index) => {
        let sentimentScore = 0;
        let sentimentLabel = 'neutral';

        if (item.insights && item.insights.length > 0) {
          const scores = item.insights.map(i => sentimentToScore(i.sentiment));
          sentimentScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

          if (sentimentScore >= 0.5) sentimentLabel = 'bullish';
          else if (sentimentScore >= 0.1) sentimentLabel = 'somewhat_bullish';
          else if (sentimentScore <= -0.5) sentimentLabel = 'bearish';
          else if (sentimentScore <= -0.1) sentimentLabel = 'somewhat_bearish';
        }

        return {
          id: `watchlist-${sector}-${Date.now()}-${index}`,
          title: item.title,
          url: item.article_url,
          published_at: item.published_utc,
          source: item.publisher.name,
          banner_image: item.image_url || '',
          summary: item.description || '',
          sentiment_score: sentimentScore,
          sentiment_label: sentimentLabel,
          category: sector,
          logo_url: item.publisher.logo_url || ''
        };
      });

    } catch (error) {
      console.error(`[WatchlistService] Error fetching ${sector}:`, error);
      if (retryCount < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        retryCount++;
      } else {
        return [];
      }
    }
  }

  return [];
}

/**
 * Process a batch of sectors and update the database
 * Uses UPSERT pattern - only updates sectors in this batch, preserves others
 */
export async function processBatch(
  batchNumber: number,
  sectors: string[],
  polygonApiKey: string
): Promise<BatchResult> {
  const startTime = Date.now();
  const supabase = createSupabaseAdmin();

  console.log(`[WatchlistService] Processing batch ${batchNumber} with ${sectors.length} sectors: ${sectors.join(', ')}`);

  try {
    // Fetch all articles for this batch
    const allArticles: WatchlistNewsItem[] = [];
    const sectorBreakdown: Record<string, number> = {};

    for (let i = 0; i < sectors.length; i++) {
      const sector = sectors[i];

      // Rate limit: wait between calls (except first)
      if (i > 0) {
        console.log(`[WatchlistService] Waiting ${API_DELAY_MS}ms before next API call...`);
        await sleep(API_DELAY_MS);
      }

      const articles = await fetchNewsForSector(sector, polygonApiKey);
      sectorBreakdown[sector] = articles.length;
      allArticles.push(...articles);

      console.log(`[WatchlistService] ${sector}: ${articles.length} articles`);
    }

    // Delete ONLY articles from sectors in this batch (preserve other batches)
    const { error: deleteError } = await supabase
      .from('watchlist_cached_news')
      .delete()
      .in('category', sectors);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    // Insert new articles
    if (allArticles.length > 0) {
      const { error: insertError } = await supabase
        .from('watchlist_cached_news')
        .insert(allArticles.map(article => ({
          article_id: article.id,
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
        })));

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message}`);
      }
    }

    // Update metadata
    const now = new Date();
    const nextUpdate = new Date(now);
    nextUpdate.setHours(nextUpdate.getHours() + 12);

    const { error: metadataError } = await supabase
      .from('watchlist_news_metadata')
      .upsert({
        id: 1,
        last_updated: now.toISOString(),
        next_update: nextUpdate.toISOString()
      });

    if (metadataError) {
      // Log but don't fail the batch - metadata is non-critical
      // The news articles were already successfully updated
      console.warn(`[WatchlistService] Metadata update failed (non-critical): ${metadataError.message}`);
    }

    const executionTime = (Date.now() - startTime) / 1000;

    console.log(`[WatchlistService] Batch ${batchNumber} completed in ${executionTime.toFixed(1)}s`);

    return {
      success: true,
      batch: batchNumber,
      sectors_processed: sectors,
      articles_count: allArticles.length,
      sector_breakdown: sectorBreakdown,
      execution_time_seconds: executionTime
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[WatchlistService] Batch ${batchNumber} failed:`, errorMessage);

    return {
      success: false,
      batch: batchNumber,
      sectors_processed: sectors,
      articles_count: 0,
      sector_breakdown: {},
      execution_time_seconds: (Date.now() - startTime) / 1000,
      error: errorMessage
    };
  }
}

