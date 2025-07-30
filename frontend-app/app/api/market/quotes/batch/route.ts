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
 * API route to get market quotes for multiple symbols in a single request.
 * This route is a proxy to the backend service and supports batching.
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

    // 3. Make parallel requests to individual quote endpoints
    const quotePromises = symbols.map(async (symbol: string) => {
      try {
        const targetUrl = `${backendConfig.url}/api/market/quote/${encodeURIComponent(symbol)}`;
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: createBackendHeaders(backendConfig, user.id),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            symbol: symbol.toUpperCase(),
            price: data.price,
            change: data.change,
            changesPercentage: data.changesPercentage,
            open: data.open,
            previousClose: data.previousClose,
            dayHigh: data.dayHigh,
            dayLow: data.dayLow,
            volume: data.volume,
            timestamp: data.timestamp,
            name: data.name,
            marketCap: data.marketCap,
            exchange: data.exchange
          };
        } else {
          console.warn(`Failed to fetch quote for ${symbol}: ${response.status}`);
          return null;
        }
      } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error);
        return null;
      }
    });

    // Wait for all quote requests to complete
    const results = await Promise.allSettled(quotePromises);
    const quotes = results
      .map((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        } else {
          console.warn(`Failed to get quote for ${symbols[index]}`);
          return null;
        }
      })
      .filter(quote => quote !== null);

    return NextResponse.json({ quotes }, { status: 200 });

  } catch (error: any) {
    return handleApiError(error, request.nextUrl.pathname);
  }
} 