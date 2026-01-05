import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/portfolio/freshness
 * 
 * Check portfolio data freshness status.
 * Returns whether data needs sync and when it was last updated.
 */
export async function GET(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get JWT token from session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json(
        { error: 'Authentication required - no token' },
        { status: 401 }
      );
    }

    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Call backend freshness endpoint
    const response = await fetch(`${backendUrl}/api/portfolio/freshness`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': backendApiKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Portfolio Freshness API: Backend error: ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to check freshness' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in portfolio freshness API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

