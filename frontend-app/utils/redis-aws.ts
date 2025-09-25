import Redis from 'ioredis';

// Initialize Redis client using AWS ElastiCache (same as backend)
const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Connection timeout
  connectTimeout: 10000,
  // Command timeout
  commandTimeout: 5000,
  // Retry configuration
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  // Enable offline queue
  enableOfflineQueue: false,
});

// Handle connection events
redisClient.on('connect', () => {
  console.log('Redis client connected to AWS ElastiCache');
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('close', () => {
  console.log('Redis client connection closed');
});

// Graceful shutdown
process.on('SIGINT', () => {
  redisClient.disconnect();
});

process.on('SIGTERM', () => {
  redisClient.disconnect();
});

export default redisClient;
