import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticateUser, 
  getBackendProxyConfig,
  createBackendHeaders,
  handleError 
} from '@/utils/api/route-middleware';

/**
 * User-based watchlist API (works for both aggregation and brokerage modes)
 * GET: Fetch user's watchlist
 * 
 * SECURITY FIX: User ID is derived from JWT token on backend to prevent IDOR attacks
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Authenticate user and get their verified ID + access token
    const userContext = await authenticateUser();

    // Get backend configuration (centralized, consistent error handling)
    const config = getBackendProxyConfig();

    // Call backend API to get watchlist
    // SECURITY: User ID extracted from JWT token on backend, not from URL
    console.log(`Getting watchlist for user ${userContext.userId}`);
    const response = await fetch(`${config.backendUrl}/api/user/watchlist`, {
      method: 'GET',
      headers: createBackendHeaders(config, userContext.accessToken),
      cache: 'no-store'
    });

    const responseBody = await response.text();
    
    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        errorDetail = responseBody || errorDetail;
      }
      console.error(`Watchlist API Error - ${errorDetail}`);
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
    console.error('Error in user watchlist API:', error);
    return handleError(error);
  }
}

