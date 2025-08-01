import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ApiProxyService } from '@/utils/services/ApiProxyService';
import { createSecureBackendHeaders } from '@/utils/api/secure-backend-helpers';
import { AuthService } from '@/utils/api/auth-service';

export const dynamic = 'force-dynamic';

/**
 * API route to download trade documents.
 * 
 * SECURITY: This route properly validates both authentication and authorization:
 * - Authenticates the user via JWT token
 * - Verifies account ownership to prevent unauthorized access
 * - Uses secure backend headers for API communication
 * 
 * The ApiProxyService handles:
 * - File downloads (PDF, images, etc.)
 * - 204 No Content responses
 * - Binary data responses
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountId: string; documentId: string }> }
) {
  try {
    const params = await context.params;
    const { accountId, documentId } = params;

    // SECURITY: Authenticate and authorize user for this specific account
    // This prevents any authenticated user from accessing documents from other accounts
    const authContext = await AuthService.authenticateAndAuthorize(request, accountId);

    // 2. Construct backend path
    const backendPath = `/api/account/${accountId}/documents/${documentId}/download`;

    // 3. Use ApiProxyService to proxy the request with secure headers
    const proxyService = ApiProxyService.getInstance();
    const backendConfig = {
      url: process.env.BACKEND_API_URL!,
      apiKey: process.env.BACKEND_API_KEY!
    };

    if (!backendConfig.url || !backendConfig.apiKey) {
      console.error('[API Proxy] Backend API URL or Key is not configured.');
      return NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
    }

    const proxyRequest = {
      backendPath,
      method: 'GET' as const
    };

    try {
      const proxyResponse = await proxyService.proxy(
        backendConfig,
        authContext.authToken, // Use the validated JWT token
        proxyRequest
      );

      // Handle different response types based on content type
      const contentType = proxyResponse.headers?.['content-type'] || '';
      
      if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
        // File download response
        const response = new NextResponse(proxyResponse.data as ArrayBuffer, {
          status: proxyResponse.status,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': proxyResponse.headers?.['content-disposition'] || 'attachment',
            ...proxyResponse.headers
          }
        });
        return response;
      }

      // Fallback for other content types
      return new NextResponse(proxyResponse.data as ArrayBuffer, {
        status: proxyResponse.status,
        headers: proxyResponse.headers
      });

    } catch (error: any) {
      console.error('[API Proxy] Error downloading document:', error);
      
      // Handle specific error types
      if (error.status === 404) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      
      if (error.status === 403) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      
      return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
    }

  } catch (error: any) {
    // Handle authentication and authorization errors
    const authError = AuthService.handleAuthError(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
} 