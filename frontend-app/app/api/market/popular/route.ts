import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { SecureErrorMapper } from '@/utils/services/errors';

/**
 * API route to get popular/common stocks for initial display.
 * 
 * Returns a curated list of well-known stocks that can be shown
 * before the user starts typing. This is much more efficient than
 * loading all 12K+ assets.
 * 
 * Query parameters:
 * - limit: Max results to return (optional, default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // 2. Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit') || '50';

    // 3. Proxy the request to backend
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}/api/market/popular?limit=${limit}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': backendApiKey,
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
      const backendError = responseData?.error || responseData?.detail || '';
      SecureErrorMapper.logError(backendError, response.status, request.nextUrl.pathname);
      const safeErrorMessage = SecureErrorMapper.mapError(backendError, response.status);
      return NextResponse.json({ error: safeErrorMessage }, { status: response.status });
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error(`[API Route Error] ${error.message}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
