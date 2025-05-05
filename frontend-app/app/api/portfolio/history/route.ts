import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get('accountId');
  const period = searchParams.get('period'); // e.g., 1D, 1W, 1M, 1Y, MAX
  // Optional params: timeframe, date_end, extended_hours
  const timeframe = searchParams.get('timeframe');
  const date_end = searchParams.get('date_end');
  const extended_hours = searchParams.get('extended_hours');

  if (!accountId) {
    return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
  }
  if (!period) {
      return NextResponse.json({ detail: 'Period is required' }, { status: 400 });
  }

  // --- Fetch from actual backend ---
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'; 
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl) {
    console.error("Portfolio History API Route Error: Backend URL not configured.");
    return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
  }

  // Construct the target URL with query parameters
  const targetUrl = new URL(`${backendUrl}/api/portfolio/${accountId}/history`);
  targetUrl.searchParams.append('period', period);
  if (timeframe) targetUrl.searchParams.append('timeframe', timeframe);
  if (date_end) targetUrl.searchParams.append('date_end', date_end);
  if (extended_hours !== null) targetUrl.searchParams.append('extended_hours', extended_hours); // Pass boolean as string

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

    const responseBody = await backendResponse.text(); // Read body once

     if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(responseBody); // Try parsing body we already read
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { /* Ignore if not JSON */ }
      console.error(`Portfolio History API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    // Attempt to parse the JSON response
    let data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        console.error("Portfolio History API Route: Failed to parse backend JSON response.", e);
        return NextResponse.json({ detail: 'Invalid response from backend service' }, { status: 502 });
    }

    // Return the successful response from the backend
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Portfolio History API Route: Unexpected error", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 