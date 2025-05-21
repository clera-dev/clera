import { Redis } from '@upstash/redis';

// Initialize Redis client using the Upstash Redis REST API
const redisClient = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
});

export default redisClient;