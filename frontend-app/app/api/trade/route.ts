import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to place a trade order.
 * This route is a proxy to the backend service.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // 2. Get the request body
    const requestBody = await request.json();

    // 3. Construct final backend path
    const backendPath = '/api/trade';

    // 4. Proxy the request
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}${backendPath}`;

    // Create AbortController with timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': backendApiKey,
          'X-User-ID': user.id,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

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
        let errorMessage = 'Failed to place trade order. Please try again later.';
        if (response.status >= 500) {
          // Hide backend details for server errors
          return NextResponse.json({ error: errorMessage }, { status: 502 });
        } else {
          // For 4xx, try to pass backend error detail if available
          const backendError = responseData?.error || responseData?.detail || errorMessage;
          return NextResponse.json({ error: backendError }, { status: response.status });
        }
      }

      return NextResponse.json(responseData, { status: response.status });

    } catch (fetchError: any) {
      // Clear the timeout to prevent it from firing after we've already handled the error
      clearTimeout(timeoutId);
      
      // Handle fetch errors, including AbortError if the request was cancelled
      if (fetchError.name === 'AbortError') {
        console.warn('[API Proxy] Request timed out for backend service.');
        return NextResponse.json({ error: 'Backend service timed out. Please try again later.' }, { status: 504 });
      }
      console.error('[API Proxy] Failed to fetch from backend service.', fetchError);
      return NextResponse.json({ error: 'An unexpected error occurred while communicating with the backend service.' }, { status: 502 });
    }

  } catch (error: any) {
    console.error(`[API Route Error] ${error.message}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 