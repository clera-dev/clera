import { Redis } from '@upstash/redis';

const redisClient = new Redis({
  url: process.env.CACHE_KV_REST_API_URL!,
  token: process.env.CACHE_KV_REST_API_TOKEN!,
});

export default redisClient;