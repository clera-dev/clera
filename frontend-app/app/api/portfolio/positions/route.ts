import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
  }

  // --- Fetch from actual backend ---
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    console.error("Portfolio Positions API Route Error: Backend URL not configured.");
    return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
  }

  const targetUrl = `${backendUrl}/api/portfolio/${accountId}/positions`;
  console.log(`Proxying request to: ${targetUrl}`);

  try {
    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
    // Add API key if available
    if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store' // Ensure fresh data
    });

    const responseBody = await backendResponse.text();

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { /* Ignore if not JSON */ }
      console.error(`Portfolio Positions API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    let data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        console.error("Portfolio Positions API Route: Failed to parse backend JSON response.", e);
        return NextResponse.json({ detail: 'Invalid response from backend service' }, { status: 502 });
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Portfolio Positions API Route: Unexpected error", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 