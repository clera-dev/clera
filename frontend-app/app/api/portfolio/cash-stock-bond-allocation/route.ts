import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Cash/Stock/Bond Allocation API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
    }

    console.log(`Cash/Stock/Bond Allocation API: Getting allocation for account: ${accountId}, user: ${user.id}`);

    // =================================================================
    // CRITICAL SECURITY FIX: Verify account ownership before querying
    // =================================================================
    
    // Verify that the authenticated user owns the accountId
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    
    if (onboardingError || !onboardingData) {
      console.error(`Cash/Stock/Bond Allocation API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Cash/Stock/Bond Allocation API: Ownership verified. User ${user.id} owns account ${accountId}`);

    // --- Fetch from actual backend ---
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Cash/Stock/Bond Allocation API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    const targetUrl = `${backendUrl}/api/portfolio/cash-stock-bond-allocation?account_id=${accountId}`;
    console.log(`Proxying request to: ${targetUrl}`);

    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
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
      console.error(`Backend cash/stock/bond allocation error: ${response.status} - ${errorText}`);
      
      // Return appropriate error response
      if (response.status === 404) {
        return NextResponse.json(
          { detail: 'No positions found for this account' }, 
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { detail: 'Unable to retrieve allocation data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error in cash/stock/bond allocation API route:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 