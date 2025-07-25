import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * API route to get a list of tradable market assets.
 * This route is a proxy to the backend service.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // 2. Proxy the request to backend
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}/api/market/assets`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': backendApiKey,
        'X-User-ID': user.id,
      },
    });

    const responseText = await response.text();
    const responseData = responseText ? JSON.parse(responseText) : {};

    return NextResponse.json(responseData, { status: response.status });

  } catch (error: any) {
    console.error(`[API Route Error] ${error.message}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 