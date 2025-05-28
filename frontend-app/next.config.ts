/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure server-side environment variables are accessible
  env: {
    BACKEND_API_URL: process.env.BACKEND_API_URL,
    BACKEND_API_KEY: process.env.BACKEND_API_KEY,
  },
  // Add PostHog rewrites
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  // Other config options...
};

module.exports = nextConfig;
