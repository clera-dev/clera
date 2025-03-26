/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure server-side environment variables are accessible
  env: {
    BACKEND_API_URL: process.env.BACKEND_API_URL,
    BACKEND_API_KEY: process.env.BACKEND_API_KEY,
  },
  // Other config options...
};

module.exports = nextConfig;
