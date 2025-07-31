import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { ApiProxyService } from '@/utils/services/ApiProxyService';
import { createSecureBackendHeaders } from '@/utils/api/secure-backend-helpers';

export const dynamic = 'force-dynamic';

/**
 * API route to download trade documents.
 * This route demonstrates how to use ApiProxyService for file downloads.
 * 
 * The fixed ApiProxyService now properly handles:
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

    // 1. Authenticate user and get JWT token
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Get the session to extract JWT token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Session token required' }, { status: 401 });
    }

    // 2. Construct backend path
    const backendPath = `/api/account/${accountId}/documents/${documentId}/download`;

    // 3. Use ApiProxyService to proxy the request
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
        session.access_token,
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
    console.error(`[API Route Error] ${error.message}`, { path: request.nextUrl.pathname });
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 