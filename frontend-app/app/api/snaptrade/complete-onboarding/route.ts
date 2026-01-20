import { NextRequest, NextResponse } from 'next/server';

/**
 * Complete onboarding after successful SnapTrade connection.
 * 
 * This endpoint is called from the callback page after SnapTrade redirects back.
 * It triggers the backend to:
 * 1. Fetch and store the SnapTrade connection
 * 2. Update user_onboarding status to 'submitted'
 * 
 * This is necessary because webhooks may not be configured or may have delays.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authorizationId, broker } = body;
    
    const authHeader = request.headers.get('authorization');
    console.log(`[Complete Onboarding] Triggering backend sync for authorization ${authorizationId}`);
    console.log(`[Complete Onboarding] Authorization header present: ${!!authHeader}`);
    
    if (!authHeader) {
      console.error('[Complete Onboarding] ❌ Missing Authorization header!');
      return NextResponse.json(
        { error: 'Unauthorized - Missing JWT token' },
        { status: 401 }
      );
    }
    
    // Call the BACKEND endpoint to handle the connection sync
    // The backend will:
    // 1. Fetch SnapTrade connection data
    // 2. Store in snaptrade_brokerage_connections
    // 3. Sync accounts to user_investment_accounts  
    // 4. Update user_onboarding status to 'submitted'
    const backendUrl = process.env.BACKEND_API_URL;
    if (!backendUrl) {
      console.error('[Complete Onboarding] ❌ BACKEND_API_URL not configured!');
      return NextResponse.json(
        { error: 'Backend service is not configured' },
        { status: 500 }
      );
    }
    
    console.log(`[Complete Onboarding] 📤 Calling backend: ${backendUrl}/api/snaptrade/sync-connection`);
    
    const response = await fetch(`${backendUrl}/api/snaptrade/sync-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        authorization_id: authorizationId,
        broker
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[Complete Onboarding] Backend sync failed:', errorData);
      return NextResponse.json(
        { error: 'Failed to sync connection', details: errorData },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    console.log(`✅ [Complete Onboarding] Backend sync successful:`, result);
    
    return NextResponse.json({
      success: true,
      message: 'Onboarding completed successfully',
      ...result
    });
    
  } catch (error) {
    console.error('[Complete Onboarding] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

