/** @type {import('next').NextConfig} */
const nextConfig = {
  // transpilePackages: ['@alpacahq/alpaca-trade-api'], // No longer needed
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    return [
      // WebSocket endpoint - proxied through the API server
      {
        source: '/ws/portfolio/:accountId*',
        destination: `${backendUrl}/ws/portfolio/:accountId*`,
      },
      {
        source: '/ws/health',
        destination: `${backendUrl}/ws/health`,
      },
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
      // REMOVED: Direct asset API proxy - now using Next.js API route
      // {
      //   source: '/api/assets/:path*',
      //   destination: `${backendUrl}/api/assets/:path*`,
      // },
      // Add other specific backend API paths here if needed
      // IMPORTANT: Do NOT add a generic `/api/:path*` rule here, 
      // as it would conflict with Next.js internal API routes (like /api/fmp)
    ]
  },
};

export default nextConfig; 