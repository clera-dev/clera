console.log('Environment config:', {
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'not set',
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'not set',
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'not set',
}); 