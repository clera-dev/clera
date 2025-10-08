import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio Positions API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const filterAccount = searchParams.get('filter_account'); // Account filtering parameter

    console.log(`Portfolio Positions API: Request for user: ${user.id}, accountId: ${accountId}, filter: ${filterAccount}`);

    // =================================================================
    // FEATURE FLAG BASED ROUTING: Check portfolio mode to determine data source
    // =================================================================
    
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Portfolio Positions API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    // First, get the portfolio mode for this user
    const portfolioModeUrl = `${backendUrl}/api/portfolio/connection-status`;
    
    const modeHeaders: HeadersInit = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
    };
    
    if (backendApiKey) {
      modeHeaders['X-API-Key'] = backendApiKey;
    }
    
    let portfolioMode = 'aggregation'; // Default to aggregation mode
    
    try {
      const modeResponse = await fetch(portfolioModeUrl, {
        method: 'GET',
        headers: modeHeaders,
        cache: 'no-store'
      });
      
      if (modeResponse.ok) {
        const modeData = await modeResponse.json();
        portfolioMode = modeData.portfolio_mode || 'aggregation';
      }
    } catch (error) {
      console.warn('Failed to get portfolio mode, defaulting to aggregation:', error);
    }
    
    console.log(`Portfolio Positions API: Portfolio mode for user ${user.id}: ${portfolioMode}`);

    // Route based on portfolio mode
    if (portfolioMode === 'aggregation' || portfolioMode === 'hybrid') {
      // =================================================================
      // AGGREGATION MODE: Use Plaid aggregated data with account filtering
      // =================================================================
      console.log(`Portfolio Positions API: Using aggregation mode for user ${user.id}, filter: ${filterAccount || 'total'}`);
      
      // Add filter_account parameter if specified
      const filterParam = filterAccount ? `?filter_account=${encodeURIComponent(filterAccount)}` : '';
      const aggregatedUrl = `${backendUrl}/api/portfolio/aggregated${filterParam}`;
      
      const headers: HeadersInit = {
        'Accept': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
      };
      
      if (backendApiKey) {
        headers['X-API-Key'] = backendApiKey;
      }
      
      const backendResponse = await fetch(aggregatedUrl, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      const responseBody = await backendResponse.text();

      if (!backendResponse.ok) {
        let errorDetail = `Aggregated portfolio request failed: ${backendResponse.status}`;
        try {
          const errorJson = JSON.parse(responseBody);
          errorDetail = errorJson.detail || errorDetail;
        } catch (e) { /* Ignore if not JSON */ }
        console.error(`Portfolio Positions API Route: Aggregation Error - ${errorDetail}`);
        return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
      }

      let data;
      try {
          data = JSON.parse(responseBody);
      } catch (e) {
          console.error("Portfolio Positions API Route: Failed to parse aggregated response.", e);
          return NextResponse.json({ detail: 'Invalid response from aggregation service' }, { status: 502 });
      }

      console.log(`Portfolio Positions API: Returning ${Array.isArray(data) ? data.length : 0} aggregated positions`);
      return NextResponse.json(data, { status: 200 });
      
    } else if (portfolioMode === 'brokerage') {
      // =================================================================
      // BROKERAGE MODE: Use existing Alpaca logic
      // =================================================================
      console.log(`Portfolio Positions API: Using brokerage mode for user ${user.id}`);
      
      if (!accountId) {
        return NextResponse.json({ detail: 'Account ID is required for brokerage mode' }, { status: 400 });
      }
      
      // Verify account ownership for Alpaca accounts
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
        .eq('user_id', user.id)
        .eq('alpaca_account_id', accountId)
        .single();
      
      if (onboardingError || !onboardingData) {
        console.error(`Portfolio Positions API: User ${user.id} does not own Alpaca account ${accountId}`);
        return NextResponse.json(
          { error: 'Alpaca account not found or access denied' },
          { status: 403 }
        );
      }

      const targetUrl = `${backendUrl}/api/portfolio/${accountId}/positions`;
      console.log(`Proxying to Alpaca positions: ${targetUrl}`);

      const headers: HeadersInit = {
        'Accept': 'application/json'
      };
      
      if (backendApiKey) {
        headers['x-api-key'] = backendApiKey;
      }
      
      const backendResponse = await fetch(targetUrl, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      const responseBody = await backendResponse.text();

      if (!backendResponse.ok) {
        let errorDetail = `Alpaca positions request failed: ${backendResponse.status}`;
        try {
          const errorJson = JSON.parse(responseBody);
          errorDetail = errorJson.detail || errorDetail;
        } catch (e) { /* Ignore if not JSON */ }
        console.error(`Portfolio Positions API Route: Alpaca Error - ${errorDetail}`);
        return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
      }

      let data;
      try {
          data = JSON.parse(responseBody);
      } catch (e) {
          console.error("Portfolio Positions API Route: Failed to parse Alpaca response.", e);
          return NextResponse.json({ detail: 'Invalid response from Alpaca service' }, { status: 502 });
      }

      return NextResponse.json(data, { status: 200 });
      
    } else {
      // =================================================================
      // DISABLED MODE: No portfolio data available
      // =================================================================
      console.log(`Portfolio Positions API: Portfolio mode disabled for user ${user.id}`);
      return NextResponse.json([], { status: 200 });
    }

  } catch (error) {
    console.error("Portfolio Positions API Route: Unexpected error", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 