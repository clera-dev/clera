import { NextRequest, NextResponse } from 'next/server';

// This route runs on the server, so it can safely access environment variables.
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
  }

  if (!BACKEND_API_KEY) {
    console.error('Error: BACKEND_API_KEY environment variable is not set on the Next.js server.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const backendUrl = `${API_BASE_URL}/api/portfolio/${accountId}/analytics`;

  try {
    const response = await fetch(backendUrl, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BACKEND_API_KEY, // Use the secret key here
      },
      // Important for server-to-server requests - prevent caching issues if needed
      cache: 'no-store', 
    });

    const data = await response.json();

    if (!response.ok) {
      // Forward the error from the backend
      console.error(`Backend analytics error (${response.status}):`, data.detail || response.statusText);
      return NextResponse.json({ error: `Failed to fetch analytics: ${data.detail || response.statusText}` }, { status: response.status });
    }

    // Forward the successful response from the backend
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching analytics from backend:', error);
    return NextResponse.json({ error: 'Internal server error while fetching analytics' }, { status: 500 });
  }
} 