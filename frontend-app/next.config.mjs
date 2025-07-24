/** @type {import('next').NextConfig} */
const nextConfig = {
  // Move serverComponentsExternalPackages to top level (Next.js 15.3+)
  serverExternalPackages: ['@langchain/langgraph-sdk'],
  
  // Exclude API routes from static optimization
  trailingSlash: false,
  
  // Use the environment variable for the backend URL, with a fallback for development
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    console.log('Using backend URL for rewrites:', backendUrl);
    
    return [
      // PostHog analytics rewrites
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
      // Add any specific rewrites here if needed
      // Most API calls should go through Next.js API routes for security
    ];
  },

  // Ensure proper tree shaking for the LangGraph SDK
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure LangGraph SDK is properly bundled server-side
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('@langchain/langgraph-sdk');
      }
    }
    return config;
  },
};

export default nextConfig;
