import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/portfolio/sync-if-stale
 * 
 * Intelligently sync portfolio data only if it's stale.
 * This is the PRODUCTION-GRADE approach:
 * - Checks staleness first (fast - just a DB query)
 * - Only calls SnapTrade API if data is actually stale
 * - Returns immediately with cached data if fresh
 * 
 * Query params:
 *   force: boolean - If true, sync regardless of staleness
 */
export async function POST(request: Request) {
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
    
    // Check for force parameter
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    // Call backend sync-if-stale endpoint
    const response = await fetch(`${backendUrl}/api/portfolio/sync-if-stale?force=${force}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': backendApiKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Portfolio Sync-If-Stale API: Backend error: ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to sync portfolio' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`Portfolio Sync-If-Stale API: ${data.synced ? 'Synced' : 'Skipped'} - ${data.reason}`);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in portfolio sync-if-stale API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

