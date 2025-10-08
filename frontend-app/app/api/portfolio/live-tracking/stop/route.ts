import { NextResponse } from 'next/server';
import { 
  authenticateUser, 
  proxyToBackend, 
  handleBackendResponse, 
  handleError 
} from '@/utils/api/route-middleware';

/**
 * Stop live tracking for authenticated user
 * 
 * SECURITY FIX: Enforces authenticated user ID - prevents IDOR attacks
 * by never accepting user_id from query parameters
 */
export async function DELETE(request: Request) {
  try {
    // SECURITY: Authenticate user and get their verified ID
    const userContext = await authenticateUser();

    console.log(`Live Tracking Stop API: Stopping live tracking for user: ${userContext.userId}`);

    // Proxy to backend with authenticated user ID
    const backendResponse = await proxyToBackend(
      '/api/portfolio/live-tracking/stop',
      userContext,
      { method: 'DELETE' }
    );

    return handleBackendResponse(backendResponse);

  } catch (error) {
    console.error('Live Tracking Stop API error:', error);
    return handleError(error);
  }
}
