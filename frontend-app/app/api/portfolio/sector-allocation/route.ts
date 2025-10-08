import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user first (following pattern from other routes)
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Sector Allocation API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const account_id = searchParams.get('account_id');

    if (!account_id) {
      return NextResponse.json({ detail: 'account_id parameter is required' }, { status: 400 });
    }

      console.log(`Sector Allocation API: Getting allocation for account: ${account_id}, user: ${user.id}`);

    // Fetch from backend API
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Sector Allocation API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    // CRITICAL FIX: Pass user_id to backend for portfolio mode detection
    const targetUrl = `${backendUrl}/api/portfolio/sector-allocation?account_id=${account_id}&user_id=${encodeURIComponent(user.id)}`;
    console.log(`Proxying sector allocation request to: ${targetUrl}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add API key if available (for authenticated backend requests)
    if (backendApiKey) {
      headers['X-API-Key'] = backendApiKey;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store', // Ensure fresh data for real-time portfolio values
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend sector allocation error: ${response.status} - ${errorText}`);
      
      // Return appropriate error response
      if (response.status === 404) {
        return NextResponse.json(
          { detail: 'No positions found for this account' }, 
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { detail: `Backend error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in sector allocation API route:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 