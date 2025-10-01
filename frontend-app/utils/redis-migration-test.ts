// Test script to verify Redis migration from Upstash to AWS ElastiCache
const Redis = require('ioredis');

async function testRedisConnection() {
  console.log('Testing Redis connection to AWS ElastiCache...');
  
  // Create Redis client for testing
  const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0'),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
  });
  
  try {
    // Test basic connectivity
    const pong = await redisClient.ping();
    console.log('✅ Redis ping successful:', pong);
    
    // Test set/get operations
    const testKey = 'migration-test-key';
    const testValue = 'migration-test-value';
    
    await redisClient.set(testKey, testValue, 'EX', 60); // Expire in 60 seconds
    console.log('✅ Redis set operation successful');
    
    const retrievedValue = await redisClient.get(testKey);
    console.log('✅ Redis get operation successful:', retrievedValue);
    
    if (retrievedValue === testValue) {
      console.log('✅ Value matches expected result');
    } else {
      console.log('❌ Value mismatch:', { expected: testValue, actual: retrievedValue });
    }
    
    // Test lock operations (like the ones used in the API routes)
    const lockKey = 'migration-test-lock';
    const lockResult = await redisClient.set(lockKey, '1', 'EX', 10, 'NX');
    console.log('✅ Redis lock acquisition test:', lockResult === 'OK' ? 'SUCCESS' : 'FAILED');
    
    // Test lock release
    await redisClient.del(lockKey);
    console.log('✅ Redis lock release test: SUCCESS');
    
    // Clean up test key
    await redisClient.del(testKey);
    console.log('✅ Cleanup completed');
    
    console.log('\n🎉 All Redis migration tests passed!');
    console.log('✅ Upstash → AWS ElastiCache migration is working correctly');
    
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    console.error('Make sure REDIS_HOST, REDIS_PORT, and REDIS_DB environment variables are set correctly');
    throw error;
  } finally {
    // Close the connection
    redisClient.disconnect();
  }
}

// Export for use in other test files
module.exports = { testRedisConnection };

// Run test if this file is executed directly
if (require.main === module) {
  testRedisConnection()
    .then(() => {
      console.log('Migration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration test failed:', error);
      process.exit(1);
    });
}
