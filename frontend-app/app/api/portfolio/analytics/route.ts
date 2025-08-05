import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';

/**
 * API route to get portfolio analytics.
 * 
 * SECURITY: This route implements proper authentication and authorization
 * to prevent privilege escalation attacks. Users can only access analytics for accounts they own.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Get query parameters to extract accountId
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // 2. SECURITY: Authenticate user and verify account ownership
    // This prevents any logged-in user from accessing other users' portfolio analytics
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // 3. Use BackendService for secure communication with proper JWT forwarding
    const backendService = new BackendService();
    const result = await backendService.getPortfolioAnalytics(
      authContext.accountId,
      authContext.user.id,
      authContext.authToken
    );

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Portfolio Analytics API: Error fetching analytics:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle authentication/authorization errors
    if (error && typeof error === 'object' && 'status' in error) {
      const authError = AuthService.handleAuthError(error);
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    
    // Handle backend service errors
    const backendError = BackendService.handleBackendError(error);
    return NextResponse.json({ error: backendError.message }, { status: backendError.status });
  }
} 