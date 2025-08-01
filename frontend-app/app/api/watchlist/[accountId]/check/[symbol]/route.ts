import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { AuthService } from '@/utils/api/auth-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string; symbol: string }> }
) {
  try {
    const { accountId, symbol } = await params;
    
    // SECURITY: Authenticate and authorize user for this specific account
    // This prevents any authenticated user from checking watchlists from other accounts
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // Get backend configuration
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      console.error('Missing backend API configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Call backend API to check if symbol is in watchlist
    console.log(`Checking if symbol ${symbol} is in watchlist for account ${authContext.accountId}`);
    const response = await fetch(`${backendUrl}/api/watchlist/${authContext.accountId}/check/${symbol}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': backendApiKey,
        'Authorization': `Bearer ${authContext.authToken}`, // Use validated JWT token
      },
      cache: 'no-store'
    });

    const responseBody = await response.text();
    
    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        // If we can't parse JSON, use the raw text
        errorDetail = responseBody || errorDetail;
      }
      console.error(`Watchlist Check API Error - ${errorDetail}`);
      return NextResponse.json(
        { error: errorDetail },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Failed to parse backend JSON response.", e);
      return NextResponse.json(
        { error: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    return NextResponse.json(data);

  } catch (error: any) {
    // Handle authentication and authorization errors
    const authError = AuthService.handleAuthError(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
} 