import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Health check doesn't require authentication - it's a system status endpoint
    
    // Proxy to backend with API key only
    const backendUrl = `${process.env.BACKEND_API_URL}/api/test/portfolio/health`;
    
    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text();
      console.error('Backend error getting health status:', errorData);
      return NextResponse.json(
        { 
          overall_status: 'error',
          error: 'Backend health check failed',
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in health route:', error);
    return NextResponse.json(
      { 
        overall_status: 'error',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
