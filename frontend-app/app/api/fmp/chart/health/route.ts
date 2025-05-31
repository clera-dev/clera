import { NextResponse } from 'next/server';
import redisClient from '@/utils/redis';

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
      // Test FMP API with a simple request
      const testUrl = `https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=${apiKey}`;
      const response = await fetch(testUrl);
      healthData.fmp.status = response.ok ? 'healthy' : 'unhealthy';
    } catch (fmpError) {
      console.error('FMP API health check failed:', fmpError);
      healthData.fmp.status = 'unhealthy';
    }
  } else {
    healthData.fmp.status = 'unconfigured';
  }

  return NextResponse.json(healthData);
} 