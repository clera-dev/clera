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
    const filterAccount = searchParams.get('filter_account'); // Account filtering parameter for X-Ray Vision

    if (!account_id) {
      return NextResponse.json({ detail: 'account_id parameter is required' }, { status: 400 });
    }

    console.log(`Sector Allocation API: Getting allocation for account: ${account_id}, user: ${user.id}, filter: ${filterAccount || 'none'}`);

    // Fetch from backend API
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Sector Allocation API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    // PRODUCTION-GRADE: Pass user_id, filter_account, AND JWT token to backend
    // SECURITY: URL-encode all user-provided parameters to prevent injection
    const filterParam = filterAccount ? `&filter_account=${encodeURIComponent(filterAccount)}` : '';
    const targetUrl = `${backendUrl}/api/portfolio/sector-allocation?account_id=${encodeURIComponent(account_id)}&user_id=${encodeURIComponent(user.id)}${filterParam}`;
    console.log(`Proxying sector allocation request to: ${targetUrl}`);
    
    // Get session for JWT token
    const session = await supabase.auth.getSession();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // CRITICAL: Add JWT token for user authentication
    if (session.data.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
    }

    // Add API key for service authentication
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