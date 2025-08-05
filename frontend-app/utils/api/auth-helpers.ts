import { NextRequest } from 'next/server';
import { BackendClient, createBackendClient } from '@/lib/server/backend-client';
import { AuthService, AuthContext } from './auth-service';

export interface AuthResult {
  user: any;
  accountId: string;
  backendClient: BackendClient;
}

/**
 * Helper function that combines authentication via AuthService with backend client creation
 * Uses the existing AuthService to avoid duplicating authentication logic
 * 
 * @param request - The incoming request
 * @param params - Promise containing route parameters with accountId
 * @returns AuthResult with user, accountId, and backend client
 */
export async function authenticateAndAuthorize(
  request: NextRequest,
  params: Promise<{ accountId: string }>
): Promise<AuthResult> {
  const { accountId } = await params;
  
  // Use existing AuthService for authentication and authorization
  const authContext: AuthContext = await AuthService.authenticateAndAuthorize(request, accountId);
  
  // Create secure backend client (handles environment variables internally)
  const backendClient = createBackendClient();
  
  return {
    user: authContext.user,
    accountId: authContext.accountId,
    backendClient
  };
}

/**
 * Helper function to handle common error responses from authentication/authorization
 * Delegates to AuthService.handleAuthError for consistency
 */
export function handleAuthError(error: unknown): { error: string; status: number } {
  const authError = AuthService.handleAuthError(error);
  return {
    error: authError.message,
    status: authError.status
  };
} 