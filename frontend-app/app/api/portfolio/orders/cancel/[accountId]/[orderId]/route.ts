import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';

/**
 * API route to cancel a specific order for an account.
 * 
 * SECURITY: This route implements proper authentication and authorization
 * to prevent unauthorized order manipulation. Users can only cancel orders from accounts they own.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string; orderId: string }> }
) {
  try {
    const { accountId, orderId } = await params;

    // SECURITY: Authenticate and authorize user for this specific account
    // This prevents any authenticated user from cancelling orders from other accounts
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

    // Call backend API to cancel the order
    console.log(`Cancelling order ${orderId} for account ${authContext.accountId}`);
    const response = await fetch(`${backendUrl}/api/portfolio/${authContext.accountId}/orders/${orderId}`, {
      method: 'DELETE',
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
      
      console.error(`Cancel Order API Error - ${errorDetail}`);
      
      // Map common backend errors to user-friendly messages
      let userFriendlyMessage = errorDetail;
      if (response.status === 404) {
        userFriendlyMessage = 'Order not found or already processed';
      } else if (response.status === 422) {
        userFriendlyMessage = 'Order cannot be cancelled (may be filled or already cancelled)';
      } else if (response.status >= 500) {
        userFriendlyMessage = 'Server error while cancelling order. Please try again.';
      }
      
      return NextResponse.json(
        { error: userFriendlyMessage },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error('Failed to parse backend JSON response:', e);
      return NextResponse.json(
        { error: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    console.log(`Successfully cancelled order ${orderId} for account ${authContext.accountId}`);
    return NextResponse.json(data, { status: 200 });

  } catch (error: any) {
    console.error('Cancel Order API: Error cancelling order:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle authentication and authorization errors
    const authError = AuthService.handleAuthError(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}