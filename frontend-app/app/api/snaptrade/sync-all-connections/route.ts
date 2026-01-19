import { NextRequest, NextResponse } from 'next/server';

/**
 * Sync ALL SnapTrade connections for the authenticated user.
 * 
 * This endpoint is called from the callback page after SnapTrade redirects back.
 * Unlike the specific sync endpoint, this fetches ALL user connections from SnapTrade
 * and syncs them to our database.
 * 
 * Why: SnapTrade does NOT return authorizationId in the callback URL,
 * so we need to fetch all connections and find the new one.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.BACKEND_API_URL) {
      console.error('[Sync All Connections] ❌ BACKEND_API_URL not configured!');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    console.log(`[Sync All Connections] Starting sync for user`);
    console.log(`[Sync All Connections] Authorization header present: ${!!authHeader}`);
    
    if (!authHeader) {
      console.error('[Sync All Connections] ❌ Missing Authorization header!');
      return NextResponse.json(
        { error: 'Unauthorized - Missing JWT token' },
        { status: 401 }
      );
    }
    
    // Call the BACKEND endpoint to handle the connection sync
    const backendUrl = process.env.BACKEND_API_URL;
    
    console.log(`[Sync All Connections] 📤 Calling backend: ${backendUrl}/api/snaptrade/sync-all`);
    
    const apiKey = process.env.BACKEND_API_KEY;
    if (!apiKey) {
      console.error('[Sync All Connections] ❌ BACKEND_API_KEY not configured!');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    const response = await fetch(`${backendUrl}/api/snaptrade/sync-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': authHeader,
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[Sync All Connections] ❌ Backend sync failed:', errorData);
      return NextResponse.json(
        { error: 'Failed to sync connections', details: errorData },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    console.log(`✅ [Sync All Connections] Backend sync successful:`, result);
    
    return NextResponse.json({
      success: true,
      message: 'All connections synced successfully',
      ...result
    });
    
  } catch (error) {
    console.error('[Sync All Connections] ❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

