import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string; documentId: string }> }
) {
  try {
    const { accountId, documentId } = await params;

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify account ownership
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    if (onboardingError || !onboardingData) {
      return NextResponse.json({ error: 'Account not found or access denied' }, { status: 403 });
    }

    // Proxy to backend
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    if (!backendUrl) {
      return NextResponse.json({ error: 'Backend service configuration error' }, { status: 500 });
    }
    const targetUrl = `${backendUrl}/api/account/${accountId}/documents/${documentId}/download`;
    const headers: HeadersInit = { 'Accept': 'application/pdf, application/octet-stream' };
    if (backendApiKey) headers['x-api-key'] = backendApiKey;

    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers,
    });

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorText = await backendResponse.text();
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { /* ignore */ }
      return NextResponse.json({ error: errorDetail }, { status: backendResponse.status >= 500 ? 502 : backendResponse.status });
    }

    // Stream the file response
    const fileBuffer = await backendResponse.arrayBuffer();
    let filename = `document_${documentId}.pdf`;
    const contentDisposition = backendResponse.headers.get('Content-Disposition');
    if (contentDisposition && contentDisposition.includes('filename=')) {
      const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
      if (filenameMatch) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': backendResponse.headers.get('Content-Type') || 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 