import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { validateAndSanitizeSymbols } from '@/utils/security';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to get market quotes for multiple symbols in a single request.
 * This route is a proxy to the backend service and supports batching.
 */
export async function POST(
  request: NextRequest
) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // 2. Parse request body to get symbols (handle aborted/invalid JSON gracefully)
    let symbols: string[] | undefined;
    try {
      const body = await request.json();
      symbols = body?.symbols;
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
      if (err?.name === 'AbortError' || message.includes('aborted')) {
        return NextResponse.json({ error: 'Request aborted by client' }, { status: 499 });
      }
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (symbols.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 symbols allowed per batch' }, { status: 400 });
    }

    // 3. Validate and sanitize all symbols to prevent SSRF attacks
    const validatedSymbols = validateAndSanitizeSymbols(symbols);

    if (validatedSymbols.length === 0) {
      return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
    }

    // 4. Use backend's existing batch endpoint for true batching
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    // 5. Make single request to backend's batch endpoint (true batching)
    const targetUrl = `${backendUrl}/api/market/quotes/batch`;
    
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': backendApiKey,
          // No user authentication needed - this is public market data
        },
        body: JSON.stringify({
          symbols: validatedSymbols
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Backend returns { quotes: [...], errors: [...] }
        // Return the same format for consistency
        return NextResponse.json({ 
          quotes: data.quotes || [],
          errors: data.errors || []
        }, { status: 200 });
      } else {
        console.error(`Backend batch request failed: ${response.status}`);
        return NextResponse.json({ 
          error: 'Failed to fetch quotes from backend service.' 
        }, { status: 502 });
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
      if (error?.name === 'AbortError' || message.includes('aborted')) {
        return NextResponse.json({ error: 'Request aborted by client' }, { status: 499 });
      }
      console.error('Error calling backend batch endpoint:', error);
      return NextResponse.json({ 
        error: 'Failed to communicate with backend service.' 
      }, { status: 502 });
    }

  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    if (error?.name === 'AbortError' || message.includes('aborted')) {
      return NextResponse.json({ error: 'Request aborted by client' }, { status: 499 });
    }
    console.error(`[API Route Error] ${error?.message || 'Unknown error'}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 