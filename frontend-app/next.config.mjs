/** @type {import('next').NextConfig} */
const nextConfig = {
  // Move serverComponentsExternalPackages to top level (Next.js 15.3+)
  serverExternalPackages: ['@langchain/langgraph-sdk'],
  
  // Exclude API routes from static optimization
  trailingSlash: false,
  
  // Use the environment variable for the backend URL, with a fallback for development
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    
    return [
      // PostHog analytics rewrites
      // IMPORTANT: Place specific rules before generic catch-alls to avoid unreachable code
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      // Add any specific rewrites here if needed
      // Most API calls should go through Next.js API routes for security
    ];
  },


};

export default nextConfig;
