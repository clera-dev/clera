import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio Document Download API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' }, 
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' }, 
        { status: 400 }
      );
    }

    console.log(`Portfolio Document Download API: Downloading document ${documentId} for account: ${accountId}, user: ${user.id}`);

    // =================================================================
    // CRITICAL SECURITY FIX: Verify account ownership before querying
    // =================================================================
    
    // Verify that the authenticated user owns the accountId
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    
    if (onboardingError || !onboardingData) {
      console.error(`Portfolio Document Download API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Portfolio Document Download API: Ownership verified. User ${user.id} owns account ${accountId}`);

    // --- Fetch from backend API ---
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Portfolio Document Download API Route Error: Backend URL not configured.");
      return NextResponse.json(
        { error: 'Backend service configuration error' }, 
        { status: 500 }
      );
    }

    // Construct the target URL for document download
    const targetUrl = `${backendUrl}/api/account/${accountId}/documents/${documentId}/download`;

    console.log(`Proxying document download request to: ${targetUrl}`);

    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/pdf, application/octet-stream'
    };
    
    // Add API key if available
    if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store' // Ensure fresh data
    });

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorText = await backendResponse.text();
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { 
        // Ignore if not JSON 
      }
      console.error(`Portfolio Document Download API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json(
        { error: errorDetail }, 
        { status: backendResponse.status >= 500 ? 502 : backendResponse.status }
      );
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
    console.error("Portfolio Document Download API Route: Unexpected error", error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 