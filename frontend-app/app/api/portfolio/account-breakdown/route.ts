import { NextResponse } from 'next/server';
import { 
  authenticateUser, 
  proxyToBackend, 
  handleBackendResponse, 
  handleError 
} from '@/utils/api/route-middleware';

/**
 * Get account breakdown for authenticated user
 * 
 * SECURITY FIX: Enforces authenticated user ID - prevents IDOR attacks
 * by never accepting user_id from query parameters
 */
export async function GET(request: Request) {
  try {
    // SECURITY: Authenticate user and get their verified ID
    const userContext = await authenticateUser();

    console.log(`Account Breakdown API: Getting account breakdown for user: ${userContext.userId}`);

    // Proxy to backend with authenticated user ID
    const backendResponse = await proxyToBackend(
      '/api/portfolio/account-breakdown',
      userContext,
      { method: 'GET' }
    );

    return handleBackendResponse(backendResponse);

  } catch (error) {
    console.error('Account Breakdown API error:', error);
    return handleError(error);
  }
}
