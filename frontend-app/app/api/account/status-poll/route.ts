import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body to get account ID
    const { accountId } = await request.json();
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Authenticate and authorize user for this account; obtain validated JWT
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // Call the backend API to get account status
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('Backend configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Encode account ID to prevent path traversal/SSRF via crafted values
    const safeAccountId = encodeURIComponent(authContext.accountId);
    const response = await fetch(`${backendUrl}/api/account/${safeAccountId}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authContext.authToken}`, // Use validated JWT token
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend request failed:', response.status, errorText);
      
      // If account not found or other backend error, return error for frontend to handle
      return NextResponse.json(
        { 
          error: response.status === 404 ? 'Account not found' : 'Failed to fetch account status',
          accountReady: false 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Determine if account is ready based on status
    // Account creation success states: APPROVED, ACTIVE
    // Pending states: APPROVAL_PENDING, AML_REVIEW  
    // Failed states: ACTION_REQUIRED, DISABLED, etc.
    const status = data.status || '';
    const accountReady = ['APPROVED', 'ACTIVE'].includes(status);
    const accountFailed = ['ACTION_REQUIRED', 'DISABLED', 'REJECTED'].includes(status);
    
    return NextResponse.json({
      ...data,
      accountReady,
      accountFailed,
      isPending: !accountReady && !accountFailed
    });

  } catch (error: any) {
    // Normalize authentication/authorization errors first
    const authError = AuthService.handleAuthError(error);
    if (authError.status !== 500) {
      return NextResponse.json({ error: authError.message, accountReady: false }, { status: authError.status });
    }

    console.error('Error in account status poll API route:', error);
    return NextResponse.json({ error: 'Internal server error', accountReady: false }, { status: 500 });
  }
}
