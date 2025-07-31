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

// Helper function to validate date ranges
function validateDateRange(from?: string | null, to?: string | null): { isValid: boolean; error?: string } {
  if (!from || !to) return { isValid: true }; // No dates provided is valid
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const now = new Date();
  
  // Check for invalid dates
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return { isValid: false, error: 'Invalid date format. Use YYYY-MM-DD.' };
  }
  
  // Check if from date is after to date
  if (fromDate > toDate) {
    return { isValid: false, error: 'From date cannot be after to date.' };
  }
  
  // Allow reasonable future dates (for timezone differences) but not too far
  const maxFutureDate = new Date(now);
  maxFutureDate.setDate(now.getDate() + 2); // Allow up to 2 days in future
  
  if (toDate > maxFutureDate) {
    return { 
      isValid: false, 
      error: `To date cannot be more than 2 days in the future. Requested: ${to}, Max: ${maxFutureDate.toISOString().split('T')[0]}` 
    };
  }
  
  // Check for excessively old dates (more than 10 years)
  const minDate = new Date(now);
  minDate.setFullYear(now.getFullYear() - 10);
  
  if (fromDate < minDate) {
    return { 
      isValid: false, 
      error: `From date cannot be more than 10 years ago. Requested: ${from}, Min: ${minDate.toISOString().split('T')[0]}` 
    };
  }
  
  return { isValid: true };
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

  // Validate symbol format (basic check)
  if (!/^[A-Z0-9\.\-\^]+$/i.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol format' }, { status: 400 });
  }

  // Validate interval
  const validIntervals = ['5min', '15min', '30min', '1hour', '4hour', 'daily'];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json({ 
      error: `Invalid interval. Valid intervals: ${validIntervals.join(', ')}` 
    }, { status: 400 });
  }

  // Validate date range
  const dateValidation = validateDateRange(from, to);
  if (!dateValidation.isValid) {
    console.warn(`Invalid date range for ${symbol}: ${dateValidation.error}`);
    return NextResponse.json({ error: dateValidation.error }, { status: 400 });
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
    console.log(`Fetching from FMP: symbol=${symbol}, interval=${interval}, from=${from}, to=${to}`);

    // Build FMP API URL
    const fmpUrl = buildFmpUrl(symbol, interval, from, to, apiKey);
    console.log(`FMP URL: ${fmpUrl}`);

    const response = await fetch(fmpUrl, {
      headers: {
        'User-Agent': 'Clera-StockChart/1.0'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`FMP API Error for chart ${symbol} (${interval}): ${response.status} ${response.statusText}`, errorData);
      
      // Provide more specific error messages based on status code
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'API key quota exceeded or invalid. Please check your FMP subscription.' },
          { status: 403 }
        );
      } else if (response.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else if (response.status === 404) {
        return NextResponse.json(
          { 
            error: `No chart data found for symbol: ${symbol}`,
            details: `Symbol ${symbol} not found or no data available for the requested interval (${interval}) and date range.`,
            suggestion: 'verify_symbol'
          },
          { status: 404 }
        );
      } else {
        return NextResponse.json(
          { 
            error: `FMP API error: ${response.status} ${response.statusText}`,
            details: errorData
          },
          { status: response.status }
        );
      }
    }

    const data = await response.json();
    
    // Cache the response
    const ttl = getCacheTTL(interval);
    await redisClient.setex(cacheKey, ttl, JSON.stringify(data));
    
    console.log(`Cached chart data for ${cacheKey} with TTL: ${ttl}s`);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching chart data for ${symbol}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data. Please try again later.' },
      { status: 500 }
    );
  }
} 