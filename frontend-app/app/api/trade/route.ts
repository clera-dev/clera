import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { SecureErrorMapper } from '@/utils/services/errors';
import { AuthService } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';

/**
 * Ensures this route is always treated as dynamic, preventing Next.js
 * from throwing errors about `params` usage.
 */
export const dynamic = 'force-dynamic';

/**
 * API route to place a trade order.
 * 
 * SECURITY: This route implements proper authentication and authorization
 * to prevent privilege escalation attacks. Users can only trade on accounts they own.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Get the request body to extract account_id
    const requestBody = await request.json();
    const { account_id } = requestBody;

    if (!account_id) {
      return NextResponse.json({ error: 'Account ID is required in request body' }, { status: 400 });
    }

    // 2. SECURITY: Authenticate user and verify account ownership
    // This prevents any logged-in user from trading on behalf of ANY account
    const authContext = await AuthService.authenticateAndAuthorize(request, account_id);

    // 3. Use BackendService for secure communication with proper JWT forwarding
    const backendService = new BackendService();
    const result = await backendService.placeTrade(
      authContext.accountId,
      authContext.user.id,
      requestBody,
      authContext.authToken
    );

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Trade API: Error placing trade:', error instanceof Error ? error.message : 'Unknown error');
    
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