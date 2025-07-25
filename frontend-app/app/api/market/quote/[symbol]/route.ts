import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Market Quote API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate symbol parameter
    if (!symbol) {
      return NextResponse.json(
        { error: 'Stock symbol is required' },
        { status: 400 }
      );
    }

    // Validate symbol format (basic check)
    if (!/^[A-Z0-9\.\-\^]+$/i.test(symbol)) {
      return NextResponse.json(
        { error: 'Invalid symbol format' },
        { status: 400 }
      );
    }

    // --- Fetch from actual backend ---
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Market Quote API Route Error: Backend URL not configured.");
      return NextResponse.json({ error: 'Backend service configuration error' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}/api/market/quote/${encodeURIComponent(symbol.toUpperCase())}`;
    console.log(`Market Quote API: Proxying request to: ${targetUrl}`);

    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // Add API key if available
    if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store' // Ensure fresh data for real-time quotes
    });

    const responseBody = await backendResponse.text();

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { /* Ignore if not JSON */ }
      
      // Log detailed error for server-side debugging
      console.error(`Market Quote API Route: Backend Error for ${symbol} - ${errorDetail}`);
      
      // Return appropriate error to client based on status code
      if (backendResponse.status === 404) {
        return NextResponse.json(
          { error: `No quote data found for symbol: ${symbol}` },
          { status: 404 }
        );
      } else if (backendResponse.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else {
        return NextResponse.json(
          { error: 'Failed to fetch market quote. Please try again later.' },
          { status: backendResponse.status >= 500 ? 502 : backendResponse.status }
        );
      }
    }

    let data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        console.error("Market Quote API Route: Failed to parse backend JSON response.", e);
        return NextResponse.json({ error: 'Invalid response from backend service' }, { status: 502 });
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Market Quote API Route: Unexpected error", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 