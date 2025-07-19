/** @type {import('next').NextConfig} */
const nextConfig = {
  // transpilePackages: ['@alpacahq/alpaca-trade-api'], // No longer needed
  
  // Webpack configuration - inline for better maintainability and Next.js conventions
  webpack: (config, { dev, isServer }) => {
    // Apply production optimizations for client builds only
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    
    return config;
  },
  
  // Enable compression for better performance
  compress: true,
  
  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
  },
  
  async rewrites() {
    // Add a default value for backendUrl if it's not defined in environment variables
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    console.log(`Using backend URL for rewrites: ${backendUrl}`);
    
    return [
      // REMOVE: WebSocket endpoint - proxied through the API server
      // {
      //   source: '/ws/portfolio/:accountId*',
      //   destination: `${backendUrl}/ws/portfolio/:accountId*`,
      // },
      // {
      //   source: '/ws/health',
      //   destination: `${backendUrl}/ws/health`,
      // },
      // Portfolio endpoints
      {
        source: '/api/portfolio/:path*',
        destination: `${backendUrl}/api/portfolio/:path*`,
      },
      // Specific proxy rules for backend API endpoints
      {
        source: '/api/market/:path*',
        destination: `${backendUrl}/api/market/:path*`, 
      },
      {
        source: '/api/trade/:path*',
        destination: `${backendUrl}/api/trade/:path*`,
      },
      {
        source: '/api/chat/:path*', // Include if chat still goes through backend
        destination: `${backendUrl}/api/chat/:path*`,
      },
      {
        source: '/api/chat-stream/:path*', // Added for streaming
        destination: `${backendUrl}/api/chat-stream/:path*`,
      },
      {
        source: '/api/resume-chat-stream/:path*', // Added for resume
        destination: `${backendUrl}/api/resume-chat-stream/:path*`,
      },
      {
        source: '/api/account/:path*',
        destination: `${backendUrl}/api/account/:path*`,
      },
      // IMPORTANT: Do NOT add a generic `/api/:path*` rule here, 
      // as it would conflict with Next.js internal API routes (like /api/fmp)
      
      // Add PostHog rewrites
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/s/:path*',
        destination: 'https://us.i.posthog.com/s/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
