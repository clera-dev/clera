import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { 
  authenticateAndConfigureBackend, 
  createBackendHeaders, 
  convertErrorToResponse 
} from '@/lib/utils/api-route-helpers';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to get market quotes for multiple symbols in a single batch request.
 * This route proxies to the backend's batch quotes endpoint, making only ONE 
 * backend API call regardless of the number of symbols (up to 50).
 * 
 * Architectural Pattern: True batching - avoids N+1 anti-pattern by consolidating
 * multiple symbol requests into a single backend call.
 */
export async function POST(
  request: NextRequest
) {
  try {
    // 1. Authenticate user and configure backend
    const { user, backendConfig } = await authenticateAndConfigureBackend();

    // 2. Parse request body to get symbols
    const body = await request.json();
    const { symbols } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (symbols.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 symbols allowed per batch' }, { status: 400 });
    }

    // 3. Make a single batch request to the backend (proper batching)
    const targetUrl = `${backendConfig.url}/api/market/quotes/batch`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: createBackendHeaders(backendConfig, user.id),
      body: JSON.stringify({ symbols }),
    });

    if (!response.ok) {
      throw new Error(`Backend batch quotes request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Backend returns { quotes: [...], errors: [...] }
    const { quotes = [], errors = [] } = data;
    
    // Log any errors but still return successful quotes
    if (errors.length > 0) {
      console.warn('Some symbols failed in batch request:', errors);
    }

    return NextResponse.json({ 
      quotes,
      errors 
    }, { status: 200 });

  } catch (error: any) {
    return convertErrorToResponse(error, request.nextUrl.pathname);
  }
} 