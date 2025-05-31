import { NextResponse } from 'next/server';
import redisClient from '@/utils/redis';

// Helper function to build FMP API URL
function buildFmpUrl(symbol: string, interval: string, from?: string | null, to?: string | null, apiKey?: string): string {
  let fmpUrl: string;
  
  if (interval === 'daily') {
    // Use the light EOD endpoint for daily data
    fmpUrl = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}`;
    if (from) fmpUrl += `&from=${from}`;
    if (to) fmpUrl += `&to=${to}`;
  } else {
    // Use interval endpoints for intraday data
    fmpUrl = `https://financialmodelingprep.com/stable/historical-chart/${interval}?symbol=${symbol}`;
    if (from) fmpUrl += `&from=${from}`;
    if (to) fmpUrl += `&to=${to}`;
  }
  
  if (apiKey) {
    fmpUrl += `&apikey=${apiKey}`;
  }
  
  return fmpUrl;
}

// Helper function to get cache TTL based on interval
function getCacheTTL(interval: string): number {
  switch (interval) {
    case '5min':
    case '15min':
    case '30min':
      return 300; // 5 minutes for intraday data
    case '1hour':
      return 600; // 10 minutes for hourly data
    case '4hour':
      return 1800; // 30 minutes for 4-hour data
    case 'daily':
      return 3600; // 1 hour for daily data
    default:
      return 300;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const url = new URL(request.url);
  const interval = url.searchParams.get('interval') || '5min';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const apiKey = process.env.FINANCIAL_MODELING_PREP_API_KEY;

  if (!apiKey) {
    console.error('FMP API key is not configured.');
    return NextResponse.json(
      { error: 'API key is not configured. Please contact support.' },
      { status: 500 }
    );
  }

  if (!symbol) {
    return NextResponse.json({ error: 'Stock symbol is required' }, { status: 400 });
  }

  // Validate interval
  const validIntervals = ['5min', '15min', '30min', '1hour', '4hour', 'daily'];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json({ error: 'Invalid interval. Valid intervals: 5min, 15min, 30min, 1hour, 4hour, daily' }, { status: 400 });
  }

  // Create cache key based on symbol, interval, and time range
  const cacheKey = `chart:${symbol}:${interval}:${from || 'null'}:${to || 'null'}`;
  
  try {
    // Try to get cached data first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for chart data: ${cacheKey}`);
      return NextResponse.json(typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData);
    }

    console.log(`Cache miss for chart data: ${cacheKey}`);

    // Build FMP API URL
    const fmpUrl = buildFmpUrl(symbol, interval, from, to, apiKey);

    const response = await fetch(fmpUrl);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`FMP API Error for chart ${symbol} (${interval}): ${response.status} ${response.statusText}`, errorData);
      return NextResponse.json(
        { error: `Failed to fetch chart data from FMP: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error(`Unexpected FMP API response format for chart ${symbol} (${interval}):`, data);
      return NextResponse.json({ error: 'Received unexpected data format from FMP.' }, { status: 500 });
    }

    if (data.length === 0) {
      return NextResponse.json({ error: `No chart data found for symbol: ${symbol}` }, { status: 404 });
    }

    // Get appropriate TTL for this interval
    const cacheTTL = getCacheTTL(interval);

    // Store in Redis cache with TTL (Upstash Redis)
    try {
      await redisClient.setex(cacheKey, cacheTTL, JSON.stringify(data));
      console.log(`Cached chart data for ${cacheKey} with TTL ${cacheTTL} seconds`);
    } catch (cacheError) {
      console.error(`Failed to cache data for ${cacheKey}:`, cacheError);
      // Continue without caching - don't fail the request
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error(`Error fetching FMP chart data for ${symbol}:`, error);
    
    // If Redis fails, still try to serve fresh data
    if (error instanceof Error && error.message.includes('redis')) {
      console.warn('Redis error, proceeding without cache');
      try {
        const fmpUrl = buildFmpUrl(symbol, interval, from, to, apiKey);
        const response = await fetch(fmpUrl);
        if (response.ok) {
          const data = await response.json();
          return NextResponse.json(data);
        }
      } catch (fallbackError) {
        console.error('Fallback API call also failed:', fallbackError);
      }
    }
    
    return NextResponse.json(
      { error: 'An internal server error occurred while fetching chart data.' },
      { status: 500 }
    );
  }
} 