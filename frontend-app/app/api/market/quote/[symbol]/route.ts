import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  authenticateAndConfigureBackend, 
  createBackendHeaders, 
  convertErrorToResponse 
} from '@/lib/utils/api-route-helpers';
import { SecureErrorMapper } from '@/utils/services/errors';

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
      // Extract backend error message
      const backendError = responseData?.error || responseData?.detail || '';
      
      // Log the original error for debugging (server-side only)
      SecureErrorMapper.logError(backendError, response.status, request.nextUrl.pathname);
      
      // Map to safe error message using the centralized utility
      const safeErrorMessage = SecureErrorMapper.mapError(backendError, response.status);
      
      // Return safe error message to client
      return NextResponse.json({ error: safeErrorMessage }, { status: response.status });
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    return convertErrorToResponse(error, request.nextUrl.pathname);
  }
} 