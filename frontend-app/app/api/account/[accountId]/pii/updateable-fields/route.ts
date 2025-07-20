import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/utils/api/auth-service';
import { BackendService } from '@/utils/api/backend-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    
    // Step 1: Authentication and Authorization (separate concern)
    // This ensures user is authenticated and owns the account
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);
    
    // Step 2: Backend Communication (separate concern)
    // BackendService handles API key securely without exposing it to calling code
    const backendService = new BackendService();
    const updateableFields = await backendService.getUpdateableFields(authContext.accountId, authContext.user.id);

    return NextResponse.json(updateableFields);

  } catch (error) {
    // Log error without exposing sensitive information
    console.error('Updateable Fields API: Error fetching updateable fields:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle different types of errors appropriately
    if (error && typeof error === 'object' && 'status' in error) {
      const authError = AuthService.handleAuthError(error);
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    
    const backendError = BackendService.handleBackendError(error);
    return NextResponse.json({ error: backendError.message }, { status: backendError.status });
  }
} 