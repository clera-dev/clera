# Redis Migration Guide: Upstash → AWS ElastiCache

## Overview

This migration moves the frontend Redis caching from Upstash to AWS ElastiCache Redis, consolidating all Redis operations to use the same infrastructure as the backend.

## What Changed

### 1. Redis Client
- **Before**: `@upstash/redis` package with REST API
- **After**: `ioredis` package with direct TCP connection to AWS ElastiCache

### 2. Configuration
- **Before**: `KV_REST_API_URL` and `KV_REST_API_TOKEN` environment variables
- **After**: `REDIS_HOST`, `REDIS_PORT`, and `REDIS_DB` environment variables (same as backend)

### 3. API Changes
- **Before**: `redisClient.set(key, value, { nx: true, ex: ttl })`
- **After**: `redisClient.set(key, value, 'EX', ttl, 'NX')`

## Files Modified

### New Files
- `utils/redis-aws.ts` - New AWS ElastiCache Redis client
- `utils/redis-migration-test.ts` - Migration test script
- `docs/redis-migration-guide.md` - This documentation

### Updated Files
- `app/api/news/watchlist/route.ts` - Updated to use AWS Redis
- `app/api/news/trending/route.ts` - Updated to use AWS Redis  
- `app/api/news/portfolio-summary/route.ts` - Updated to use AWS Redis
- `package.json` - Removed `@upstash/redis` dependency

## Environment Variables

### Required Environment Variables
```bash
# AWS ElastiCache Redis connection (same as backend)
REDIS_HOST=clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_DB=0
```

### Removed Environment Variables
```bash
# These are no longer needed
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Testing the Migration

### 1. Run the Migration Test
```bash
cd frontend-app
npx ts-node utils/redis-migration-test.ts
```

### 2. Test API Endpoints
```bash
# Test watchlist news endpoint
curl "http://localhost:3000/api/news/watchlist"

# Test trending news endpoint  
curl "http://localhost:3000/api/news/trending"

# Test portfolio summary endpoint (requires authentication)
curl "http://localhost:3000/api/news/portfolio-summary" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Benefits of Migration

### 1. **Cost Reduction**
- Eliminates Upstash subscription costs
- Uses existing AWS ElastiCache infrastructure

### 2. **Performance Improvement**
- Direct TCP connection instead of REST API
- Lower latency (same AWS region as backend)
- Better connection pooling

### 3. **Simplified Infrastructure**
- Single Redis instance for frontend and backend
- Consistent configuration across services
- Easier monitoring and debugging

### 4. **Reliability**
- Integrated with existing AWS infrastructure
- Better error handling and retry logic
- Consistent with backend Redis usage

## Rollback Plan

If issues arise, you can quickly rollback by:

1. **Revert the import changes**:
   ```typescript
   // Change back to:
   import redisClient from '@/utils/redis';
   ```

2. **Restore Upstash dependency**:
   ```bash
   npm install @upstash/redis@^1.34.9
   ```

3. **Restore environment variables**:
   ```bash
   KV_REST_API_URL=your_upstash_url
   KV_REST_API_TOKEN=your_upstash_token
   ```

## Monitoring

### Redis Connection Health
The new Redis client includes connection monitoring:
- Connection events are logged
- Automatic retry on connection failures
- Graceful shutdown handling

### Key Metrics to Monitor
- Redis connection status
- API response times for news endpoints
- Cache hit/miss rates
- Lock acquisition success rates

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Verify `REDIS_HOST` and `REDIS_PORT` are correct
   - Check AWS security groups allow connections from frontend

2. **Authentication Errors**
   - AWS ElastiCache doesn't require authentication tokens
   - Remove any auth-related configuration

3. **Timeout Errors**
   - Check network connectivity between frontend and Redis
   - Verify Redis instance is running and accessible

### Debug Commands
```bash
# Test Redis connectivity
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com -p 6379 ping

# Check Redis info
redis-cli -h clera-redis.x1zzpk.0001.usw1.cache.amazonaws.com -p 6379 info
```

## Next Steps

1. **Deploy the changes** to your staging environment
2. **Run the migration test** to verify connectivity
3. **Test all news API endpoints** thoroughly
4. **Monitor performance** for any regressions
5. **Deploy to production** once verified
6. **Remove Upstash database** after successful migration

## Support

If you encounter any issues during the migration:
1. Check the migration test output
2. Review Redis connection logs
3. Verify environment variables are set correctly
4. Test with a simple Redis operation first
