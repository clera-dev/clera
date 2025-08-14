import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';

/**
 * Tool Events API - Proxy for tool activity persistence.
 * 
 * Follows the established API proxy pattern:
 * Frontend → Next.js API Route → Backend (with proper auth/headers)
 * 
 * SECURITY: Implements proper authentication and authorization.
 * ARCHITECTURE: Maintains separation of concerns and secure header handling.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    const requestBody = await request.json();
    const { action, params } = requestBody;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    // 2. For operations that require user context, extract account info and authenticate
    let authContext;
    if (action === 'start_run' && params?.userId) {
      // For start_run, authenticate against the user_id in params
      try {
        authContext = await AuthService.authenticateAndAuthorize(request, params.accountId);
        
        // Verify the user_id in params matches the authenticated user
        if (authContext.user.id !== params.userId) {
          return NextResponse.json({ error: 'Access denied: user mismatch' }, { status: 403 });
        }
      } catch (error: any) {
        const authError = AuthService.handleAuthError(error);
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
    } else {
      // For other operations, just verify authentication (no specific account needed)
      try {
        authContext = await AuthService.authenticate(request);
      } catch (error: any) {
        const authError = AuthService.handleAuthError(error);
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
    }

    // 3. Use BackendService for secure communication with proper JWT forwarding
    const backendService = new BackendService();
    const result = await backendService.request({
      endpoint: '/api/tool-events/',
      method: 'POST',
      body: { action, params },
      authToken: authContext.authToken,
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Tool Events API: Error processing request:', error instanceof Error ? error.message : 'Unknown error');
    
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
