import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Safe default response when backend is unavailable at RUNTIME
// ARCHITECTURE: Default to aggregation mode to allow users to proceed without KYC
// This enables a graceful degradation when backend is down
const DEFAULT_CONNECTION_STATUS = {
  portfolio_mode: 'aggregation',
  plaid_accounts: [],
  snaptrade_accounts: [],  // CRITICAL: Include snaptrade_accounts for frontend compatibility
  alpaca_account: null,
  total_connected_accounts: 0
};

export async function GET(request: Request) {
  // FAIL FAST: Validate required environment variables BEFORE any try block
  // Configuration errors should return 500, not be masked with defaults
  // This prevents silent misconfiguration from appearing as "working"
  if (!process.env.BACKEND_API_KEY) {
    console.error('CRITICAL: BACKEND_API_KEY environment variable is not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }
  
  if (!process.env.BACKEND_API_URL) {
    console.error('CRITICAL: BACKEND_API_URL environment variable is not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    // Authenticate user with Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Proxy to backend connection status endpoint
    // PRODUCTION-GRADE: Add timeout to prevent long waits when backend is unavailable
    const backendUrl = `${process.env.BACKEND_API_URL}/api/portfolio/connection-status`;
    
    // Create AbortController for timeout (5 seconds is reasonable for this endpoint)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const backendResponse = await fetch(backendUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY,
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!backendResponse.ok) {
        const errorData = await backendResponse.text();
        console.error('Backend error getting connection status:', errorData);
        
        // Return default values if backend returns error (runtime error, not config error)
        return NextResponse.json(DEFAULT_CONNECTION_STATUS);
      }

      const data = await backendResponse.json();
      
      // Ensure all expected fields are present in response
      return NextResponse.json({
        portfolio_mode: data.portfolio_mode || DEFAULT_CONNECTION_STATUS.portfolio_mode,
        plaid_accounts: data.plaid_accounts || [],
        snaptrade_accounts: data.snaptrade_accounts || [],
        alpaca_account: data.alpaca_account || null,
        total_connected_accounts: data.total_connected_accounts || 0,
      });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Log specific error type for debugging
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError') {
          console.warn('Backend connection-status request timed out after 5s - using defaults');
        } else {
          console.error('Fetch error in connection status route:', fetchError.message);
        }
      }
      
      // Return safe defaults on RUNTIME fetch errors (timeout, network error, etc.)
      // These are expected in production when backend is temporarily unavailable
      return NextResponse.json(DEFAULT_CONNECTION_STATUS);
    }

  } catch (error) {
    console.error('Error in connection status route:', error);
    
    // Return safe defaults on RUNTIME errors only
    return NextResponse.json(DEFAULT_CONNECTION_STATUS);
  }
}
