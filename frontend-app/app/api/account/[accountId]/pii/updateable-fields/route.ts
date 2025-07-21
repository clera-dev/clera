import { NextRequest, NextResponse } from 'next/server';
import { AuthService, AuthError } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';

/**
 * Factory function to create service dependencies
 * This follows dependency injection principles and makes testing easier
 */
function createServices() {
  return {
    authService: AuthService,
    backendService: new BackendService(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  // Inject dependencies through factory function
  const { authService, backendService } = createServices();
  
  try {
    const { accountId } = await params;
    
    // Step 1: Authentication and Authorization (separate concern)
    // This ensures user is authenticated and owns the account
    const authContext = await authService.authenticateAndAuthorize(request, accountId);
    
    // Step 2: Backend Communication (separate concern)
    // BackendService handles API key securely without exposing it to calling code
    const updateableFields = await backendService.getUpdateableFields(authContext.accountId, authContext.user.id, authContext.authToken);

    return NextResponse.json(updateableFields);

  } catch (error) {
    // Log error without exposing sensitive information
    console.error('Updateable Fields API: Error fetching updateable fields:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle AuthError responses specifically
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    // All other errors: treat as backend/server error
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
} 