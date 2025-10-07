import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';
import { createClient } from '@/utils/supabase/server';

/**
 * API route to get portfolio analytics.
 * 
 * Supports both portfolio modes:
 * - Brokerage: Requires accountId, calculates from Alpaca positions
 * - Aggregation: Uses userId, calculates from Plaid aggregated holdings
 * 
 * SECURITY: Implements proper authentication and authorization for both modes.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const filterAccount = searchParams.get('filter_account'); // Account filtering parameter

    // 2. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Portfolio Analytics API: Authentication failed');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log(`Portfolio Analytics API: Request for user: ${userId}, accountId: ${accountId}`);

    // 3. Determine portfolio mode
    let portfolioMode = 'brokerage';
    try {
      const connectionResponse = await fetch(`${request.nextUrl.origin}/api/portfolio/connection-status`, {
        headers: {
          cookie: request.headers.get('cookie') || '',
        },
      });
      
      if (connectionResponse.ok) {
        const connectionData = await connectionResponse.json();
        portfolioMode = connectionData.portfolio_mode || 'brokerage';
      } else {
        console.warn(`Portfolio Analytics API: Could not determine mode, defaulting to brokerage`);
      }
    } catch (err) {
      console.warn(`Portfolio Analytics API: Error determining mode, defaulting to brokerage:`, err);
    }
    
    console.log(`Portfolio Analytics API: Portfolio mode for user ${userId}: ${portfolioMode}`);

    // 4. Handle aggregation mode - use userId directly
    if (portfolioMode === 'aggregation') {
      console.log(`Portfolio Analytics API: Using aggregation mode for user ${userId}`);
      
      const backendUrl = process.env.BACKEND_API_URL;
      const backendApiKey = process.env.BACKEND_API_KEY;
      
      if (!backendUrl || !backendApiKey) {
        throw new Error('Backend configuration error');
      }

      // Get session for JWT token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      // Call backend aggregated analytics endpoint
      // Pass user_id and optional filter_account for account-level analytics
      const backendUrl_analytics = filterAccount 
        ? `${backendUrl}/api/portfolio/aggregated/analytics?user_id=${userId}&filter_account=${filterAccount}`
        : `${backendUrl}/api/portfolio/aggregated/analytics?user_id=${userId}`;
      
      console.log(`Portfolio Analytics API: Calling backend with filter: ${filterAccount || 'none'}`);
      
      const backendResponse = await fetch(
        backendUrl_analytics,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': backendApiKey,
            'Authorization': `Bearer ${session.access_token}`,
          },
          cache: 'no-store'
        }
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        console.error(`Backend analytics error (aggregation): ${backendResponse.status} - ${errorText}`);
        
        // Return friendly error response instead of throwing
        return NextResponse.json(
          { 
            error: `Analytics calculation failed: ${backendResponse.status}`,
            detail: errorText,
            risk_score: '0.0',
            diversification_score: '0.0'
          },
          { status: backendResponse.status }
        );
      }

      const result = await backendResponse.json();
      console.log(`Portfolio Analytics API: ✅ Returning analytics for aggregation user:`, result);
      return NextResponse.json(result);
    }

    // 5. Handle brokerage mode - use existing logic with account ownership check
    if (!accountId || accountId === 'null') {
      return NextResponse.json({ error: 'Account ID required for brokerage mode' }, { status: 400 });
    }

    console.log(`Portfolio Analytics API: Using brokerage mode for account ${accountId}`);
    
    // SECURITY: Authenticate user and verify account ownership
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // Use BackendService for secure communication
    const backendService = new BackendService();
    const result = await backendService.getPortfolioAnalytics(
      authContext.accountId,
      authContext.user.id,
      authContext.authToken
    );

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Portfolio Analytics API: Error fetching analytics:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      status: error?.status
    });
    
    // Handle authentication/authorization errors
    if (error && typeof error === 'object' && 'status' in error) {
      const authError = AuthService.handleAuthError(error);
      return NextResponse.json({ 
        error: authError.message,
        risk_score: '0.0',
        diversification_score: '0.0'
      }, { status: authError.status });
    }
    
    // Handle backend service errors with graceful degradation
    const backendError = BackendService.handleBackendError(error);
    return NextResponse.json({ 
      error: backendError.message,
      risk_score: '0.0',
      diversification_score: '0.0'
    }, { status: backendError.status });
  }
} 