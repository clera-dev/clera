import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio Documents API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD format
    const endDate = searchParams.get('endDate'); // YYYY-MM-DD format
    const documentType = searchParams.get('documentType');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' }, 
        { status: 400 }
      );
    }

    console.log(`Portfolio Documents API: Getting documents for account: ${accountId}, user: ${user.id}`);

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
      console.error(`Portfolio Documents API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Portfolio Documents API: Ownership verified. User ${user.id} owns account ${accountId}`);

    // --- Fetch from backend API ---
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl) {
      console.error("Portfolio Documents API Route Error: Backend URL not configured.");
      return NextResponse.json(
        { error: 'Backend service configuration error' }, 
        { status: 500 }
      );
    }

    // Construct the target URL with query parameters
    const targetUrl = new URL(`${backendUrl}/api/account/${accountId}/documents`);
    if (startDate) targetUrl.searchParams.append('start_date', startDate);
    if (endDate) targetUrl.searchParams.append('end_date', endDate);
    if (documentType) targetUrl.searchParams.append('document_type', documentType);

    console.log(`Proxying documents request to: ${targetUrl.toString()}`);

    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json'
    };
    
    // Add API key if available
    if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }
    
    const backendResponse = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store' // Ensure fresh data
    });

    const responseBody = await backendResponse.text();

    if (!backendResponse.ok) {
      let errorDetail = `Backend request failed with status: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) { 
        // Ignore if not JSON 
      }
      console.error(`Portfolio Documents API Route: Backend Error - ${errorDetail}`);
      return NextResponse.json(
        { error: errorDetail }, 
        { status: backendResponse.status >= 500 ? 502 : backendResponse.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Portfolio Documents API Route: Failed to parse backend JSON response.", e);
      return NextResponse.json(
        { error: 'Invalid response from backend service' }, 
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Portfolio Documents API Route: Unexpected error", error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 