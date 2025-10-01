import Redis from 'ioredis';

// Initialize Redis client using AWS ElastiCache (same as backend)
const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,
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
