import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/portfolio/sync
 * 
 * Triggers a full sync of portfolio holdings from SnapTrade/external brokerages.
 * This fetches the latest position data and updates the database.
 * 
 * Called by:
 * - Frontend refresh button on portfolio page
 * - After successful trade execution
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio Sync API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`Portfolio Sync API: Triggering sync for user: ${user.id}`);

    // Get JWT token from session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('Portfolio Sync API: No JWT token in session');
      return NextResponse.json(
        { error: 'Authentication required - no token' },
        { status: 401 }
      );
    }

    // Validate required environment variables
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl) {
      console.error('Portfolio Sync API: BACKEND_API_URL not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    if (!backendApiKey) {
      console.error('Portfolio Sync API: BACKEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Call backend sync endpoint
    const url = `${backendUrl}/api/portfolio/sync`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': backendApiKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Log full error details server-side only
      console.error(`Portfolio Sync API: Backend error: ${errorText}`);
      // Return generic error to client to avoid leaking internal details
      return NextResponse.json(
        { error: 'Failed to sync portfolio' },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`Portfolio Sync API: Sync completed - ${data.positions_synced} positions synced`);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in portfolio sync API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

