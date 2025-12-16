import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/portfolio/aggregated
 * 
 * Proxies aggregated portfolio data from the backend.
 * Used for aggregation mode to fetch all external holdings across brokerages.
 */
export async function GET(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Aggregated Portfolio API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`Aggregated Portfolio API: Fetching data for user: ${user.id}`);

    // Get JWT token from session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('Aggregated Portfolio API: No JWT token in session');
      return NextResponse.json(
        { error: 'Authentication required - no token' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const filterAccount = searchParams.get('filter_account') || '';
    const includeClera = searchParams.get('include_clera') === 'true';
    const sourceFilter = searchParams.get('source_filter') || '';

    // Build backend URL with query params (NO user_id - extracted from JWT)
    const backendUrl = process.env.BACKEND_API_URL;
    const params = new URLSearchParams({
      ...(filterAccount && { filter_account: filterAccount }),
      ...(includeClera && { include_clera: 'true' }),
      ...(sourceFilter && { source_filter: sourceFilter }),
    });
    
    const url = `${backendUrl}/api/portfolio/aggregated${params.toString() ? '?' + params.toString() : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
        'Authorization': `Bearer ${session.access_token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Aggregated Portfolio API: Backend error: ${errorText}`);
      return NextResponse.json(
        { error: `Failed to fetch aggregated portfolio: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`Aggregated Portfolio API: Successfully fetched ${data.positions?.length || 0} positions`);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in aggregated portfolio API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

