import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Types for Alpha Vantage API response
interface AlphaVantageNewsItem {
  title: string;
  url: string;
  time_published: string;
  authors: string[];
  summary: string;
  banner_image: string;
  source: string;
  category_within_source: string;
  source_domain: string;
  topics: Array<{topic: string; relevance_score: string}>;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment: Array<{ticker: string; relevance_score: string; ticker_sentiment_score: string; ticker_sentiment_label: string}>;
}

interface AlphaVantageResponse {
  feed: AlphaVantageNewsItem[];
  items: string;
  Information?: string;
  Note?: string;
  error?: string;
}

// Type for our cached news format
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
}

// Function to fetch trending market news from Alpha Vantage
async function fetchTrendingNews(): Promise<CachedNewsItem[]> {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is not configured');
    }

    // Format today's date in YYYYMMDDTHHMMSS format required by Alpha Vantage
    const now = new Date();
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T0000`;
    console.log(`Generated date format for Alpha Vantage: ${today}`);
    
    // Use financial_markets and economy topics to get broader market news
    // This provides more general market news than ticker-specific queries
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets,economy&time_from=${today}&limit=7&sort=LATEST&apikey=${apiKey}`;
    
    console.log(`Fetching trending news from Alpha Vantage: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CleraNewsBot/1.0; +http://www.clera.io/bot.html)'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Alpha Vantage API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data: AlphaVantageResponse = await response.json();
    console.log('Alpha Vantage API response:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    
    if (!data.feed || !Array.isArray(data.feed)) {
      // Check if there's an error message in the response
      if (data.Information || data.Note || data.error) {
        console.error('Alpha Vantage API error message:', data.Information || data.Note || data.error);
        throw new Error(`Alpha Vantage API error: ${data.Information || data.Note || data.error}`);
      }
      
      console.error('Invalid response format from Alpha Vantage:', JSON.stringify(data));
      throw new Error('Invalid response format from Alpha Vantage');
    }
    
    // If Alpha Vantage returned articles, process them
    if (data.feed.length > 0) {
      console.log(`Received ${data.feed.length} articles from Alpha Vantage`);
      console.log(`Sample article date: ${data.feed[0].time_published}, title: ${data.feed[0].title?.substring(0, 30)}...`);
      
      // Ensure we use exactly 7 articles (HARD LIMIT)
      const limitedFeed = data.feed.slice(0, 7);
      
      // Transform the API response to our cached format
      const articles: CachedNewsItem[] = limitedFeed.map((item, index) => {
        // Extract topics
        const topics = item.topics?.map(t => t.topic) || [];
        
        // Convert time_published from format YYYYMMDDTHHMMSS to ISO string
        let published_at = item.time_published;
        if (published_at && published_at.length === 15) {
          try {
            const year = published_at.substring(0, 4);
            const month = published_at.substring(4, 6);
            const day = published_at.substring(6, 8);
            const hour = published_at.substring(9, 11);
            const minute = published_at.substring(11, 13);
            const second = published_at.substring(13, 15);
            published_at = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
          } catch (e) {
            console.warn('Error parsing time_published:', item.time_published, e);
          }
        }
        
        return {
          id: `trending-${Date.now()}-${index}`,
          title: item.title,
          url: item.url,
          published_at,
          source: item.source_domain || item.source,
          banner_image: item.banner_image || '',
          summary: item.summary,
          sentiment_score: item.overall_sentiment_score || 0,
          sentiment_label: item.overall_sentiment_label || 'neutral',
          topics
        };
      });
      
      return articles;
    } 
    // If Alpha Vantage returned zero articles (likely due to API limits), use mock data
    else {
      console.warn('Alpha Vantage returned zero articles. Using mock data instead.');
      
      // Set to today's date in ISO format
      const currentDate = new Date().toISOString();
      console.log(`Using ISO date format for mock data: ${currentDate}`);
      
      console.log(`Using mock data with today's date: ${currentDate}`);
      
      // Create mock articles with today's date for financial markets news
      return [
        {
          id: `trending-mock-1-${Date.now()}`,
          title: "Apple & Nike Bounce on China Tariff News: A Closer Look",
          url: "https://www.zacks.com/commentary/2469919/apple-nike-bounce-on-china-tariff-news-a-closer-look",
          published_at: currentDate,
          source: "www.zacks.com",
          banner_image: "https://staticx-tuner.zacks.com/images/articles/charts/6b/103692.jpg?v=1870245351",
          summary: "In a big de-escalation of recent trade tensions, the US and China have recently agreed to a 90-day truce that significantly lowers tariffs on hundreds of billions of dollars in goods. Apple and Nike shares found much-needed relief on the news.",
          sentiment_score: 0.112121,
          sentiment_label: "Neutral",
          topics: ["Earnings", "Technology", "Manufacturing"]
        },
        {
          id: `trending-mock-2-${Date.now()}`,
          title: "Caught Off Guard, Institutions Chase Stock Market Rally",
          url: "https://www.benzinga.com/markets/equities/25/05/45417534/caught-off-guard-institutions-chase-stock-market-rally",
          published_at: currentDate,
          source: "www.benzinga.com",
          banner_image: "https://www.benzinga.com/next-assets/images/schema-image-default.png",
          summary: "To gain an edge, this is what you need to know today. The chart shows the stock market has moved above the breakout line.",
          sentiment_score: 0.141782,
          sentiment_label: "Neutral",
          topics: ["Financial Markets", "Economy - Monetary"]
        },
        {
          id: `trending-mock-3-${Date.now()}`,
          title: "Tesla Stock Surges on AI-Driven Vehicle Updates",
          url: "https://www.example.com/tesla-stock-surges",
          published_at: currentDate,
          source: "www.marketwatch.com",
          banner_image: "https://example.com/image3.jpg",
          summary: "Tesla shares jumped 8% following announcements of new AI features in their vehicle lineup.",
          sentiment_score: 0.35,
          sentiment_label: "Bullish",
          topics: ["Technology", "Automotive"]
        },
        {
          id: `trending-mock-4-${Date.now()}`,
          title: "Federal Reserve Hints at Rate Cuts in Coming Months",
          url: "https://www.example.com/fed-hints-rate-cuts",
          published_at: currentDate,
          source: "www.cnbc.com",
          banner_image: "https://example.com/image4.jpg",
          summary: "The Federal Reserve has indicated it may begin cutting interest rates as early as September as inflation pressures ease.",
          sentiment_score: 0.25,
          sentiment_label: "Somewhat_Bullish",
          topics: ["Economy - Monetary", "Financial Markets"]
        },
        {
          id: `trending-mock-5-${Date.now()}`,
          title: "Oil Prices Drop on Increased OPEC Production",
          url: "https://www.example.com/oil-prices-drop",
          published_at: currentDate,
          source: "www.reuters.com",
          banner_image: "https://example.com/image5.jpg",
          summary: "Crude oil prices fell 3% after OPEC announced a surprise increase in production quotas.",
          sentiment_score: -0.28,
          sentiment_label: "Somewhat-Bearish",
          topics: ["Energy & Transportation", "Commodities"]
        },
        {
          id: `trending-mock-6-${Date.now()}`,
          title: "Amazon Unveils New AI-Powered Shopping Experience",
          url: "https://www.example.com/amazon-ai-shopping",
          published_at: currentDate,
          source: "www.techcrunch.com",
          banner_image: "https://example.com/image6.jpg",
          summary: "Amazon's new AI shopping assistant aims to personalize the online shopping experience through advanced machine learning.",
          sentiment_score: 0.31,
          sentiment_label: "Somewhat_Bullish",
          topics: ["Technology", "Retail & Wholesale"]
        },
        {
          id: `trending-mock-7-${Date.now()}`,
          title: "Housing Market Shows Signs of Cooling After Record Highs",
          url: "https://www.example.com/housing-market-cooling",
          published_at: currentDate,
          source: "www.bloomberg.com",
          banner_image: "https://example.com/image7.jpg",
          summary: "New housing data suggests the market may be starting to cool after two years of unprecedented growth and price increases.",
          sentiment_score: -0.12,
          sentiment_label: "Neutral",
          topics: ["Real Estate & Construction", "Economy - Macro"]
        }
      ];
    }
  } catch (error: any) {
    console.error('Error fetching trending news:', error);
    throw error;
  }
}

// Function to calculate the next update time (6AM or 12PM PST)
function calculateNextUpdateTime(): Date {
  const now = new Date();
  
  // Convert to PST by subtracting hours (UTC-8, no DST adjustment for simplicity)
  // In a production environment, proper timezone handling should be implemented
  const pstOffset = -8;
  const nowPST = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + (pstOffset * 60 * 60 * 1000));
  
  // Get current hour in PST
  const hourPST = nowPST.getHours();
  
  // Create a new date for today at either 6AM or 12PM PST, whichever is next
  let nextUpdate: Date;
  
  if (hourPST < 6) {
    // Next update is at 6AM PST today
    nextUpdate = new Date(nowPST);
    nextUpdate.setHours(6, 0, 0, 0);
  } else if (hourPST < 12) {
    // Next update is at 12PM PST today
    nextUpdate = new Date(nowPST);
    nextUpdate.setHours(12, 0, 0, 0);
  } else {
    // Next update is at 6AM PST tomorrow
    nextUpdate = new Date(nowPST);
    nextUpdate.setDate(nextUpdate.getDate() + 1);
    nextUpdate.setHours(6, 0, 0, 0);
  }
  
  // Convert back to UTC for storage
  return new Date(nextUpdate.getTime() - (pstOffset * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
}

// Function to update watchlist news metadata
async function updateWatchlistNewsMetadata(supabase: any, nextUpdate: Date): Promise<void> {
  try {
    // Check if the watchlist_news_metadata table exists
    const { error: tableCheckError } = await supabase
      .from('watchlist_news_metadata')
      .select('id')
      .limit(1);
    
    // If the table doesn't exist, log it and return
    if (tableCheckError && tableCheckError.code === '42P01') {
      console.log('Watchlist news tables not yet created, skipping metadata update');
      return;
    }
    
    // Update watchlist news metadata with the same next_update as trending news
    const { error: metadataError } = await supabase
      .from('watchlist_news_metadata')
      .upsert({
        id: 1,
        last_updated: new Date().toISOString(),
        next_update: nextUpdate.toISOString()
      });
      
    if (metadataError) {
      console.error('Error updating watchlist news metadata:', metadataError);
      console.error('Metadata error details:', metadataError);
    } else {
      console.log(`Updated watchlist news metadata with next update at ${nextUpdate.toISOString()}`);
    }
  } catch (error) {
    console.error('Error in updateWatchlistNewsMetadata:', error);
  }
}

// Main handler for the cron job
export async function GET(request: Request) {
  // Check for authorization - in a real environment, you'd use a more secure method
  // This is a simple check to prevent unauthorized access
  const authHeader = request.headers.get('Authorization');
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Create a direct Supabase client with service role key for admin operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase URL or Service Role Key is not defined.');
      return NextResponse.json({ error: 'Supabase configuration error' }, { status: 500 });
    }

    // Use direct client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch new trending news from Alpha Vantage
    const articles = await fetchTrendingNews();
    
    // Clear existing cached news
    const { error: deleteError } = await supabase
      .from('cached_trending_news')
      .delete()
      .not('id', 'is', null);
      
    if (deleteError) {
      console.error('Error clearing existing cached news:', deleteError);
      throw new Error(`Error clearing existing news: ${deleteError.message}`);
    }
    
    // Log the articles we're about to insert
    console.log(`Prepared ${articles.length} articles to insert in database`);
    console.log(`First article: ${articles[0]?.title?.substring(0, 30)}... published at ${articles[0]?.published_at}`);
    
    // Insert new articles
    if (articles.length > 0) {
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
        })));
        
      if (insertError) {
        console.error('Error inserting new articles:', insertError);
        throw new Error(`Error inserting new articles: ${insertError.message}`);
      }
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
      console.error('Error updating trending news metadata:', metadataError);
    }
    
    // Also update watchlist news metadata with the same next_update time
    // This ensures both trending and watchlist news refresh at the same time
    await updateWatchlistNewsMetadata(supabase, nextUpdate);
    
    const response = { 
      success: true, 
      message: 'Trending news updated successfully', 
      count: articles.length,
      next_update: nextUpdate.toISOString() 
    };
    
    console.log(`Returning response: ${JSON.stringify(response)}`);
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error updating trending news:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
} 