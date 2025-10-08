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
    const filterAccount = searchParams.get('filter_account'); // Account filtering parameter
    const userId = user.id;

    console.log(`Cash/Stock/Bond Allocation API: Request for user: ${userId}, accountId: ${accountId}, filter: ${filterAccount}`);

    // Determine portfolio mode
    const connectionResponse = await fetch(`${request.nextUrl.origin}/api/portfolio/connection-status`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });
    
    let portfolioMode = 'brokerage';
    if (connectionResponse.ok) {
      const connectionData = await connectionResponse.json();
      portfolioMode = connectionData.portfolio_mode || 'brokerage';
    }
    
    console.log(`Cash/Stock/Bond Allocation API: Portfolio mode for user ${userId}: ${portfolioMode}`);

    // For brokerage mode, verify Alpaca account ownership BEFORE proxying
    // The backend doesn't cross-check user_id against account_id, so we must verify here
    if (portfolioMode === 'brokerage' && accountId && accountId !== 'aggregated') {
      const { data: onboardingData, error: ownershipError } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
        .eq('user_id', userId)
        .single();
      
      if (ownershipError || !onboardingData?.alpaca_account_id) {
        console.error(`Ownership verification failed for user ${userId}`);
        return NextResponse.json(
          { detail: 'Account not found or ownership verification failed' },
          { status: 403 }
        );
      }
      
      if (onboardingData.alpaca_account_id !== accountId) {
        console.error(`User ${userId} does not own account ${accountId}`);
        return NextResponse.json(
          { detail: 'Unauthorized access to account' },
          { status: 403 }
        );
      }
    }

    // --- Fetch from actual backend ---
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Cash/Stock/Bond Allocation API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    // For aggregation mode, accountId can be null - backend uses user_id
    // For brokerage mode, accountId ownership has been verified above
    const filterParam = filterAccount ? `&filter_account=${encodeURIComponent(filterAccount)}` : '';
    const targetUrl = `${backendUrl}/api/portfolio/cash-stock-bond-allocation?account_id=${encodeURIComponent(accountId || 'aggregated')}&user_id=${encodeURIComponent(userId)}${filterParam}`;
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