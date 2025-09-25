import { NextResponse } from 'next/server';
import redisClient from '@/utils/redis-aws';

export async function GET() {
  const healthData = {
    timestamp: new Date().toISOString(),
    redis: { status: 'unknown', latency: null as number | null },
    fmp: { status: 'unknown', configured: false },
    cache: { hits: 0, misses: 0, keys: 0 }
  };

  // Check Redis connectivity
  try {
    const start = Date.now();
    await redisClient.ping();
    healthData.redis.status = 'healthy';
    healthData.redis.latency = Date.now() - start;

    // Get cache statistics
    try {
      const cacheKeys = await redisClient.keys('chart:*');
      healthData.cache.keys = Array.isArray(cacheKeys) ? cacheKeys.length : 0;
    } catch (keyError) {
      console.warn('Could not retrieve cache keys:', keyError);
    }
  } catch (redisError) {
    console.error('Redis health check failed:', redisError);
    healthData.redis.status = 'unhealthy';
  }

  // Check FMP API configuration
  const apiKey = process.env.FINANCIAL_MODELING_PREP_API_KEY;
  healthData.fmp.configured = !!apiKey;
  
  if (apiKey) {
    try {
      // Test with a simple quote request for AAPL
      const testUrl = `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${apiKey}`;
      
      console.log('Testing FMP API with URL:', testUrl.replace(apiKey, '[REDACTED]'));
      
      const response = await fetch(testUrl);
      const data = await response.json();
      
      if (!response.ok) {
        console.error('FMP API test failed:', response.status, response.statusText, data);
        return NextResponse.json({
          status: 'error',
          message: `FMP API test failed: ${response.status} ${response.statusText}`,
          hasApiKey: true,
          fmpResponse: data
        }, { status: response.status });
      }

      // Test chart data specifically
      const chartTestUrl = `https://financialmodelingprep.com/api/v3/historical-chart/5min/AAPL?from=2025-01-20&to=2025-01-21&apikey=${apiKey}`;
      const chartResponse = await fetch(chartTestUrl);
      const chartData = await chartResponse.json();
      
      console.log('Chart test response:', chartResponse.status, Array.isArray(chartData) ? `${chartData.length} data points` : 'unexpected format');

      return NextResponse.json({
        status: 'success',
        message: 'FMP API is working',
        hasApiKey: true,
        quote: {
          symbol: data[0]?.symbol,
          price: data[0]?.price,
          timestamp: new Date().toISOString()
        },
        chartTest: {
          status: chartResponse.status,
          dataPoints: Array.isArray(chartData) ? chartData.length : 'Not an array',
          hasData: Array.isArray(chartData) && chartData.length > 0
        }
      });

    } catch (error) {
      console.error('FMP API test error:', error);
      return NextResponse.json({
        status: 'error',
        message: `Failed to test FMP API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        hasApiKey: true
      }, { status: 500 });
    }
  } else {
    healthData.fmp.status = 'unconfigured';
    return NextResponse.json(
      { 
        status: 'error',
        message: 'FMP API key is not configured.',
        hasApiKey: false 
      },
      { status: 500 }
    );
  }
} 