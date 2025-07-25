import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

type ApiRouteContext<T> = {
  params: T;
  body?: any;
  request: NextRequest;
};

/**
 * A production-grade wrapper for API routes that handles common logic like
 * authentication, error handling, and passing route context. This enforces
 * consistency and reduces boilerplate in individual route handlers.
 *
 * @param serverFunction The core logic of the API route, which receives the
 * authenticated user and a context object containing params, body, and the request.
 * @returns A Next.js API route handler.
 */
export function handleApiRoute<T extends Record<string, string | string[] | undefined>>(
  serverFunction: (user: any, context: ApiRouteContext<T>) => Promise<NextResponse>
) {
  return async (request: NextRequest, { params }: { params: T }) => {
    try {
      // 1. Authenticate user
      const supabase = await createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('API Route Authentication Error:', userError?.message);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
      }

      // 2. Parse request body if applicable
      let body: any;
      if (request.method !== 'GET' && request.headers.get('content-type')?.includes('application/json')) {
        try {
          body = await request.json();
        } catch (e) {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      // 3. Execute the specific server function with full context
      return await serverFunction(user, { params, body, request });

    } catch (error: any) {
      // 4. Centralized error handling
      console.error(`[API Route Error] ${error.message}`, {
        path: request.nextUrl.pathname,
        stack: error.stack,
      });

      const status = error.status || 500;
      const errorMessage = error.message || 'An unexpected server error occurred.';
      
      return NextResponse.json({ error: errorMessage }, { status });
    }
  };
}

/**
 * A specialized proxy function for forwarding requests to the backend API.
 * It handles authentication, constructing the backend URL, adding the API key,
 * and forwarding the response. It is built on top of `handleApiRoute`.
 *
 * @param backendPath The path on the backend API to proxy to (e.g., '/api/market/[symbol]').
 * @param httpMethod The HTTP method to use ('GET', 'POST', etc.).
 * @returns A Next.js API route handler.
 */
export function proxyApiRoute(backendPath: string, httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET') {
  return handleApiRoute(async (user, { params, body }) => {
    
    // Replace dynamic path segments like [symbol] with actual values from params
    let finalBackendPath = backendPath;
    if (params) {
      Object.keys(params).forEach(key => {
        const value = params[key];
        // Ensure value is a string before replacing
        if (typeof value === 'string') {
          finalBackendPath = finalBackendPath.replace(`[${key}]`, value);
        }
      });
    }

    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      throw new Error('Backend service is not configured.');
    }

    const targetUrl = `${backendUrl}${finalBackendPath}`;
    
    // console.log(`[API Proxy] Forwarding ${httpMethod} request for user ${user.id} to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': backendApiKey,
        'X-User-ID': user.id, // Forward user context
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle cases where the backend response might be empty
    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      // console.error(`[API Proxy] Failed to parse JSON from backend response. Status: ${response.status}`, responseText);
      return NextResponse.json({ error: 'Invalid response from backend service.' }, { status: 502 });
    }

    if (!response.ok) {
      // console.error(`[API Proxy] Backend request failed with status ${response.status}:`, responseData);
      return NextResponse.json(responseData, { status: response.status });
    }
    
    return NextResponse.json(responseData, { status: 200 });
  });
} 