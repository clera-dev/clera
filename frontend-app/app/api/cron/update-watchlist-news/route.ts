import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Polygon.io API response types
interface PolygonNewsItem {
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

interface PolygonResponse {
  results: PolygonNewsItem[];
  next_url: string;
  request_id: string;
  count: number;
  status: string;
}

// Type for our cached watchlist news format
interface WatchlistNewsItem {
  id: string;
  title: string;
  url: string;
  published_at: string;
  source: string;
  banner_image: string;
  summary: string;
  sentiment_score: number;
  sentiment_label: string;
  category: string; // The sector/topic this news belongs to
  logo_url: string; // Publisher's logo URL
}

// Mapping of UI categories to Sector ETF tickers and popular stocks in each sector
const categoryToTickerMap: Record<string, string> = {
  // Row 1: Global markets and alternative investments
  'globalMarkets': 'SPY,DIA', // Reduced tickers: S&P 500, Dow Jones
  'crypto': 'COIN,MSTR', // Reduced tickers: Coinbase, MicroStrategy
  'commodities': 'XOM,CVX', // Reduced tickers: Exxon, Chevron
  'fixedIncome': 'AGG,TLT', // Reduced tickers: Aggregate, Long-Term Treasury
  'forex': 'UUP,FXE', // Reduced tickers: Dollar, Euro
  
  // Row 2: Sectors
  'energy': 'XLE,XOM', // Reduced tickers: Energy ETF, Exxon
  'financials': 'XLF,JPM', // Reduced tickers: Financial ETF, JPMorgan
  'healthcare': 'XLV,JNJ', // Reduced tickers: Healthcare ETF, Johnson & Johnson
  'technology': 'XLK,AAPL', // Reduced tickers: Tech ETF, Apple
  'consumer': 'XLP,PG', // Reduced tickers: Consumer ETF, P&G
  
  // Row 3: Other categories
  'realEstate': 'IYR,AMT', // Reduced tickers: Real Estate ETF, American Tower
  'esg': 'ESGU,TSLA', // Reduced tickers: ESG ETF, Tesla
  'macroeconomic': 'SPY,QQQ' // Reduced tickers: S&P 500, Nasdaq
};

// List of all available sectors
const allSectors = Object.keys(categoryToTickerMap);

// Function to convert sentiment string to numeric score
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

// Sleep function for cleaner rate limit handling
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch news for a specific sector/topic, querying each ticker individually
async function fetchNewsForSector(sector: string, apiKey: string): Promise<WatchlistNewsItem[]> {
  try {
    // Get the ticker(s) for this sector
    const tickersString = categoryToTickerMap[sector];
    if (!tickersString) {
      console.warn(`No ticker mapping for sector: ${sector}`);
      return [];
    }
    
    // Split the tickers string into an array of individual tickers
    const tickerArray = tickersString.split(',');
    console.log(`Processing ${tickerArray.length} tickers for sector ${sector}: ${tickerArray.join(', ')}`);
    
    // Get date from 7 days ago in YYYY-MM-DD format for the API - increased from 3 to 7 days to get more articles
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    console.log(`Date filter: articles on or after ${sevenDaysAgoStr}`);
    
    let allResults: PolygonNewsItem[] = [];
    
    // Process each ticker individually
    for (let i = 0; i < tickerArray.length; i++) {
      const ticker = tickerArray[i];
      
      // Add a longer delay between ticker requests (except for the first one)
      if (i > 0) {
        console.log(`Waiting 10 seconds before next ticker API call...`);
        await sleep(10000); // Increased from 3 to 10 seconds
      }
      
      // Construct the API URL with filter for the past 7 days
      const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=5&sort=published_utc&order=desc&published_utc.gte=${sevenDaysAgoStr}&apiKey=${apiKey}`;
      
      console.log(`Fetching news for ticker ${ticker} in sector ${sector}`);
      
      // Implement exponential backoff for rate limit errors
      let retryCount = 0;
      const maxRetries = 3;
      let retryDelay = 30000; // Start with 30 seconds
      
      while (retryCount <= maxRetries) {
        try {
          // Call the Polygon.io API
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0; +http://www.clera.io/bot.html)'
            }
          });
          
          if (response.status === 429) {
            // Rate limit exceeded
            const errorText = await response.text();
            console.warn(`Rate limit exceeded for ticker ${ticker} (attempt ${retryCount + 1}/${maxRetries + 1}): ${errorText}`);
            
            if (retryCount < maxRetries) {
              console.log(`Waiting ${retryDelay/1000} seconds before retrying...`);
              await sleep(retryDelay);
              retryDelay *= 2; // Exponential backoff
              retryCount++;
              continue;
            } else {
              console.error(`Max retries exceeded for ticker ${ticker}, skipping...`);
              break;
            }
          }
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`API error for ticker ${ticker}: ${response.status} ${response.statusText} - ${errorText}`);
            break;
          }
          
          const data: PolygonResponse = await response.json();
          
          // Handle potential API errors or empty results
          if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            console.log(`No news results for ticker ${ticker}`);
            break;
          }
          
          console.log(`Received ${data.results.length} articles for ticker ${ticker}`);
          allResults = [...allResults, ...data.results];
          break; // Success, exit retry loop
          
        } catch (tickerError) {
          console.error(`Error fetching news for ticker ${ticker}:`, tickerError);
          
          if (retryCount < maxRetries) {
            console.log(`Waiting ${retryDelay/1000} seconds before retrying...`);
            await sleep(retryDelay);
            retryDelay *= 2; // Exponential backoff
            retryCount++;
          } else {
            console.error(`Max retries exceeded for ticker ${ticker}, skipping...`);
            break;
          }
        }
      }
    }
    
    // After processing all tickers, sort all results by date and take the 3 most recent
    allResults.sort((a, b) => {
      return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime();
    });
    
    // Limit to 3 most recent articles to avoid overwhelming the UI
    const limitedResults = allResults.slice(0, 3);
    console.log(`Selected ${limitedResults.length} most recent articles from ${allResults.length} total results for sector ${sector}`);
    
    // Transform the API response to our watchlist news format
    return limitedResults.map((item, index) => {
      // Calculate sentiment score based on insights if available
      let sentimentScore = 0;
      let sentimentLabel = 'neutral';
      
      if (item.insights && item.insights.length > 0) {
        // Average the sentiment of all tickers mentioned
        const sentiments = item.insights.map(insight => sentimentToScore(insight.sentiment));
        sentimentScore = sentiments.reduce((sum, score) => sum + score, 0) / sentiments.length;
        
        // Determine overall sentiment label
        if (sentimentScore >= 0.5) sentimentLabel = 'bullish';
        else if (sentimentScore >= 0.1) sentimentLabel = 'somewhat_bullish';
        else if (sentimentScore <= -0.5) sentimentLabel = 'bearish';
        else if (sentimentScore <= -0.1) sentimentLabel = 'somewhat_bearish';
        else sentimentLabel = 'neutral';
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
  } catch (error: any) {
    console.error(`Error fetching news for sector ${sector}:`, error);
    return [];
  }
}

// Main cron job handler
export async function GET(request: Request) {
  // Basic authorization check
  const authHeader = request.headers.get('Authorization');
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase URL or Service Role Key is not defined.');
      return NextResponse.json({ error: 'Supabase configuration error' }, { status: 500 });
    }

    // Create a direct Supabase client with service role key for admin operations
    // This approach is appropriate for cron jobs that need to perform admin-level operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const apiKey = process.env.POLYGON_API_KEY;
    
    if (!apiKey) {
      throw new Error('Polygon API key is not configured');
    }
    
    console.log(`Starting to update watchlist news for ${allSectors.length} sectors`);
    
    // Clear existing watchlist news
    const { error: deleteError } = await supabase
      .from('watchlist_cached_news')
      .delete()
      .not('id', 'is', null);
      
    if (deleteError) {
      console.error('Error clearing existing watchlist news:', deleteError);
      throw new Error(`Error clearing existing watchlist news: ${deleteError.message}`);
    }
    
    // We'll process sectors one at a time with proper delays to avoid rate limits
    const results: WatchlistNewsItem[] = [];
    
    // Process each sector sequentially with substantial delay to avoid rate limits
    for (let i = 0; i < allSectors.length; i++) {
      const sector = allSectors[i];
      console.log(`Processing sector ${i + 1}/${allSectors.length}: ${sector}`);
      
      // Add a longer delay between sectors (except for the first one)
      if (i > 0) {
        console.log(`Waiting 60 seconds before next sector to avoid rate limiting...`);
        await sleep(60000); // Increased from 15 to 60 seconds
      }
      
      try {
        const sectorNews = await fetchNewsForSector(sector, apiKey);
        
        if (sectorNews.length === 0) {
          console.log(`No news results for sector ${sector}`);
        } else {
          console.log(`Retrieved ${sectorNews.length} articles for sector ${sector}`);
          results.push(...sectorNews);
        }
      } catch (error: any) {
        // If we get a rate limit error, wait longer and retry once
        if (error.message && error.message.includes('429 Too Many Requests')) {
          console.log(`Rate limit hit for sector ${sector}, waiting 120 seconds and retrying...`);
          await sleep(120000); // Increased from 30 to 120 seconds
          
          try {
            const retryNews = await fetchNewsForSector(sector, apiKey);
            if (retryNews.length > 0) {
              console.log(`Retry successful: Retrieved ${retryNews.length} articles for sector ${sector}`);
              results.push(...retryNews);
            } else {
              console.log(`Retry failed: No news results for sector ${sector}`);
            }
          } catch (retryError) {
            console.error(`Retry failed for sector ${sector}:`, retryError);
          }
        } else {
          console.error(`Error fetching news for sector ${sector}:`, error);
        }
      }
    }
    
    // Log the total number of articles
    console.log(`Fetched a total of ${results.length} articles for all sectors`);
    
    // Insert successful articles into the database
    if (results.length > 0) {
      const { error: insertError } = await supabase
        .from('watchlist_cached_news')
        .insert(results.map(article => ({
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
        console.error('Error inserting watchlist news articles:', insertError);
        throw new Error(`Error inserting watchlist news articles: ${insertError.message}`);
      }
    }
    
    // Update metadata to track when the news was last updated
    const now = new Date();
    const nextUpdate = new Date(now);
    nextUpdate.setHours(nextUpdate.getHours() + 12); // Update every 12 hours
    
    const { error: metadataError } = await supabase
      .from('watchlist_news_metadata')
      .upsert({
        id: 1,
        last_updated: now.toISOString(),
        next_update: nextUpdate.toISOString()
      });
      
    if (metadataError) {
      console.error('Error updating watchlist news metadata:', metadataError);
    }
    
    // Return success response
    const response = { 
      success: true, 
      message: 'Watchlist news updated successfully', 
      sectors_updated: allSectors.length,
      articles_count: results.length,
      next_update: nextUpdate.toISOString()
    };
    
    console.log(`Returning response: ${JSON.stringify(response)}`);
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error updating watchlist news:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
} 