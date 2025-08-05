import { NextRequest } from 'next/server';

// This is a Route Handler for WebSocket connections
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  
  // Connect to the API server on port 8000, not WebSocket server on port 8001
  // The API server has a WebSocket proxy that will forward to the WebSocket server
  const backendUrl = process.env.BACKEND_API_URL;
  
  // Create the URL to the API server's WebSocket endpoint
  const url = `${backendUrl}/ws/portfolio/${accountId}`;
  
  // Forward all headers from the original request
  const headers = new Headers(request.headers);
  
  // Forward the request to the WebSocket server
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  
  // Return the response from the WebSocket server
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
} 