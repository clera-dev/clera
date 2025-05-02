import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get('accountId');
  // Add other potential query params used by the orders endpoint
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');
  const after = searchParams.get('after');
  const until = searchParams.get('until');
  const direction = searchParams.get('direction');
  const nested = searchParams.get('nested');
  const symbols = searchParams.get('symbols'); // Can be comma-separated

  if (!accountId) {
    return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
  }

  // --- Fetch from actual backend ---
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    console.error("Portfolio Orders API Route Error: Backend URL not configured.");
    return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
  }

  // Construct the target URL with query parameters
  const targetUrl = new URL(`${backendUrl}/api/portfolio/${accountId}/orders`);
  if (status) targetUrl.searchParams.append('status', status);
  if (limit) targetUrl.searchParams.append('limit', limit);
  if (after) targetUrl.searchParams.append('after', after);
  if (until) targetUrl.searchParams.append('until', until);
  if (direction) targetUrl.searchParams.append('direction', direction);
  if (nested !== null) targetUrl.searchParams.append('nested', nested);
  if (symbols) targetUrl.searchParams.append('symbols', symbols);

  console.log(`Proxying request to: ${targetUrl.toString()}`);

  try {
    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
    // Add API key if available
    if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl.toString(), {
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
      console.error(`Portfolio Orders API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    let data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        console.error("Portfolio Orders API Route: Failed to parse backend JSON response.", e);
        return NextResponse.json({ detail: 'Invalid response from backend service' }, { status: 502 });
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Portfolio Orders API Route: Unexpected error", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 