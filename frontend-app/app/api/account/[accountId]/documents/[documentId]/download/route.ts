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
      cache: 'no-store', // Prevent caching of sensitive documents
    });

    if (!backendResponse.ok) {
      // Do not expose backend error details to the client
      const isServerError = backendResponse.status >= 500;
      const status = isServerError ? 502 : backendResponse.status;
      const genericMessage = isServerError
        ? 'Document download failed due to a server error.'
        : 'Document download failed.';
      return NextResponse.json({ error: genericMessage }, { status });
    }

    // Stream the file response
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('Content-Type') || 'application/pdf',
        'Content-Disposition': backendResponse.headers.get('Content-Disposition') || 'attachment',
        // Add any other headers as needed
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 