import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { AuthService } from '@/utils/api/auth-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    // SECURITY: Authenticate and authorize user for this specific account
    // This prevents any authenticated user from accessing status from other accounts
    const authContext = await AuthService.authenticateAndAuthorize(request, (await params).accountId);

    // Proxy request to backend
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('Backend configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(`${backendUrl}/api/account/${authContext.accountId}/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authContext.authToken}`, // Use validated JWT token
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend request failed:', response.status, errorData);
      return NextResponse.json(
        { error: 'Failed to fetch account status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    // Handle authentication and authorization errors
    const authError = AuthService.handleAuthError(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    // SECURITY: Authenticate and authorize user for this specific account
    // This prevents any authenticated user from syncing status from other accounts
    const authContext = await AuthService.authenticateAndAuthorize(request, (await params).accountId);

    // Proxy sync request to backend
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error('Backend configuration missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const response = await fetch(`${backendUrl}/api/account/${authContext.accountId}/status/sync`, {
      method: 'POST',
      headers: {
        'X-API-Key': backendApiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authContext.authToken}`, // Use validated JWT token
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend sync request failed:', response.status, errorData);
      return NextResponse.json(
        { error: 'Failed to sync account status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    // Handle authentication and authorization errors
    const authError = AuthService.handleAuthError(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
} 