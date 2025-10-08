import { NextRequest, NextResponse } from 'next/server';
import { 
  authenticateUser, 
  getBackendProxyConfig,
  createBackendHeaders,
  handleError 
} from '@/utils/api/route-middleware';

/**
 * User-based watchlist add API
 * POST: Add symbol to user's watchlist
 * 
 * SECURITY FIX: Uses centralized authentication and backend configuration
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Authenticate user and get their verified ID
    const userContext = await authenticateUser();

    // Parse request body
    const requestData = await request.json();
    const { symbol } = requestData;
    
    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Get backend configuration (centralized, consistent error handling)
    const config = getBackendProxyConfig();

    // Call backend API to add symbol to watchlist
    console.log(`Adding symbol ${symbol} to watchlist for user ${userContext.userId}`);
    const response = await fetch(
      `${config.backendUrl}/api/user/${encodeURIComponent(userContext.userId)}/watchlist/add`,
      {
        method: 'POST',
        headers: createBackendHeaders(config),
        body: JSON.stringify({ symbol }),
        cache: 'no-store'
      }
    );

    const responseBody = await response.text();
    
    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        errorDetail = responseBody || errorDetail;
      }
      console.error(`Watchlist Add API Error - ${errorDetail}`);
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
    console.error('Error adding to watchlist:', error);
    return handleError(error);
  }
}

