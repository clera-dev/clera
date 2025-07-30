import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  authenticateAndConfigureBackend, 
  createBackendHeaders, 
  handleApiError 
} from '@/lib/utils/api-route-helpers';

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

    // 1. Authenticate user and configure backend
    const { user, backendConfig } = await authenticateAndConfigureBackend();

    // 2. Construct target URL and make request
    const backendPath = `/api/market/quote/${symbol}`;
    const targetUrl = `${backendConfig.url}${backendPath}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: createBackendHeaders(backendConfig, user.id),
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
    return handleApiError(error, request.nextUrl.pathname);
  }
} 