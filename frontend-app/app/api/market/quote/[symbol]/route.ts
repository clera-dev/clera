import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to get a market quote for a specific symbol.
 * This route is a proxy to the backend service.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params = await context.params;
    const { symbol } = params;

    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // 2. Construct final backend path
    const backendPath = `/api/market/quote/${symbol}`;

    // 3. Proxy the request
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}${backendPath}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': backendApiKey,
        // No user authentication needed - this is public market data
      },
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('[API Proxy] Failed to parse backend JSON response.', parseError);
      return NextResponse.json({ error: 'Invalid response from backend service.' }, { status: 502 });
    }

    if (!response.ok) {
      // Map backend error to client-friendly message
      let errorMessage = 'Failed to fetch market quote. Please try again later.';
      if (response.status >= 500) {
        // Hide backend details for server errors
        return NextResponse.json({ error: errorMessage }, { status: 502 });
      } else {
        // For 4xx, try to pass backend error detail if available
        const backendError = responseData?.error || responseData?.detail || errorMessage;
        return NextResponse.json({ error: backendError }, { status: response.status });
      }
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error(`[API Route Error] ${error.message}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 