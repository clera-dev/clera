import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { verifyAlpacaAccountOwnership } from '@/utils/api/route-middleware';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio History API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const period = searchParams.get('period'); // e.g., 1D, 1W, 1M, 1Y, MAX
    const filterAccount = searchParams.get('filter_account'); // Account filtering parameter
    // Optional params: timeframe, date_end, extended_hours
    const timeframe = searchParams.get('timeframe');
    const date_end = searchParams.get('date_end');
    const extended_hours = searchParams.get('extended_hours');

    if (!accountId) {
      return NextResponse.json({ detail: 'Account ID is required' }, { status: 400 });
    }
    if (!period) {
        return NextResponse.json({ detail: 'Period is required' }, { status: 400 });
    }

    console.log('Portfolio History API: Processing portfolio history request');

    // =================================================================
    // PORTFOLIO MODE AWARE: Check mode to determine validation and routing
    // =================================================================
    
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Portfolio History API Route Error: Backend URL not configured.");
      return NextResponse.json({ detail: 'Backend service configuration error' }, { status: 500 });
    }

    // Get portfolio mode first (following positions route pattern)
    const portfolioModeUrl = `${backendUrl}/api/portfolio/connection-status`;
    
    const modeHeaders: HeadersInit = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
    };
    
    if (backendApiKey) {
      modeHeaders['X-API-Key'] = backendApiKey;
    }
    
    let portfolioMode = 'brokerage'; // Default to brokerage for backward compatibility
    
    try {
      const modeResponse = await fetch(portfolioModeUrl, {
        method: 'GET',
        headers: modeHeaders,
        cache: 'no-store'
      });
      
      if (modeResponse.ok) {
        const modeData = await modeResponse.json();
        portfolioMode = modeData.portfolio_mode || 'brokerage';
        console.log(`Portfolio History API: Portfolio mode for user ${user.id}: ${portfolioMode}`);
      }
    } catch (error) {
      console.warn('Portfolio History API: Could not determine portfolio mode, defaulting to brokerage');
    }

    // Only validate Alpaca account ownership for brokerage/hybrid mode
    if (portfolioMode !== 'aggregation') {
      console.log('Portfolio History API: Validating Alpaca account ownership...');
      
      // REFACTOR: Use centralized ownership verification utility
      try {
        await verifyAlpacaAccountOwnership(user.id, accountId);
        console.log('Portfolio History API: Account ownership verified successfully');
      } catch (error: any) {
        console.error('Portfolio History API: Account ownership verification failed - access denied');
        return NextResponse.json(
          { error: error.message || 'Account not found or access denied' },
          { status: error.status || 403 }
        );
      }
    } else {
      console.log('Portfolio History API: Aggregation mode - skipping Alpaca account validation');
    }

    // Construct the target URL with query parameters + user_id for backend mode detection
    const targetUrl = new URL(`${backendUrl}/api/portfolio/${accountId}/history`);
    targetUrl.searchParams.append('period', period);
    targetUrl.searchParams.append('user_id', user.id); // CRITICAL: Add user_id for backend mode detection
    if (filterAccount) targetUrl.searchParams.append('filter_account', filterAccount); // CRITICAL: Add account filter for X-ray vision
    if (timeframe) targetUrl.searchParams.append('timeframe', timeframe);
    if (date_end) targetUrl.searchParams.append('date_end', date_end);
    if (extended_hours !== null) targetUrl.searchParams.append('extended_hours', extended_hours);

    console.log(`Proxying request to: ${targetUrl.toString()} ${filterAccount ? `[FILTERED TO: ${filterAccount}]` : '[TOTAL PORTFOLIO]'}`);

    // PRODUCTION-GRADE: Prepare headers with both JWT and API key
    const session = await supabase.auth.getSession();
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
    // CRITICAL: Add JWT token for user authentication
    if (session.data.session?.access_token) {
      headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
    }
    
    // Add API key for service authentication
    if (backendApiKey) {
      headers['X-API-Key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store' // Ensure fresh data
    });

    const responseBody = await backendResponse.text(); // Read body once

     if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(responseBody); // Try parsing body we already read
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { /* Ignore if not JSON */ }
      console.error(`Portfolio History API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json({ detail: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    // Attempt to parse the JSON response
    let data;
    try {
        data = JSON.parse(responseBody);
    } catch (e) {
        console.error("Portfolio History API Route: Failed to parse backend JSON response.", e);
        return NextResponse.json({ detail: 'Invalid response from backend service' }, { status: 502 });
    }

    // Return the successful response from the backend
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Portfolio History API Route: Unexpected error", error);
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }
} 