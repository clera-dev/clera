import { NextResponse } from 'next/server';
import { 
  authenticateUser, 
  proxyToBackend, 
  handleBackendResponse, 
  handleError 
} from '@/utils/api/route-middleware';

/**
 * Get live tracking status for authenticated user
 * 
 * SECURITY FIX: Enforces authenticated user ID - prevents IDOR attacks
 * by never accepting user_id from query parameters
 */
export async function GET(request: Request) {
  try {
    // SECURITY: Authenticate user and get their verified ID
    const userContext = await authenticateUser();

    console.log(`Live Tracking Status API: Getting status for user: ${userContext.userId}`);

    // Proxy to backend with authenticated user ID
    const backendResponse = await proxyToBackend(
      '/api/portfolio/live-tracking/status',
      userContext,
      { method: 'GET' }
    );

    return handleBackendResponse(backendResponse);

  } catch (error) {
    console.error('Live Tracking Status API error:', error);
    return handleError(error);
  }
}
