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
    const piiData = await backendService.getPII(authContext.accountId, authContext.user.id, authContext.authToken);

    return NextResponse.json(piiData, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    // Log error without exposing sensitive information
    console.error('PII API: Error fetching PII:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle different types of errors appropriately
    if (error && typeof error === 'object' && 'status' in error) {
      const authError = AuthService.handleAuthError(error);
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    
    const backendError = BackendService.handleBackendError(error);
    return NextResponse.json({ error: backendError.message }, { status: backendError.status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;
    
    // Step 1: Authentication and Authorization (separate concern)
    // This ensures user is authenticated and owns the account
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);
    
    // Step 2: Get request body
    const updateData = await request.json();
    
    // Step 3: Backend Communication (separate concern)
    // BackendService handles API key securely without exposing it to calling code
    const backendService = new BackendService();
    const result = await backendService.updatePII(authContext.accountId, authContext.user.id, updateData, authContext.authToken);

    return NextResponse.json(result);

  } catch (error) {
    // Log error without exposing sensitive information
    console.error('PII Update API: Error updating PII:', error instanceof Error ? error.message : 'Unknown error');
    
    // Handle different types of errors appropriately
    if (error && typeof error === 'object' && 'status' in error) {
      const authError = AuthService.handleAuthError(error);
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    
    const backendError = BackendService.handleBackendError(error);
    return NextResponse.json({ error: backendError.message }, { status: backendError.status });
  }
}

// Keep PUT for backward compatibility but it will use PATCH internally
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  return PATCH(request, { params });
} 