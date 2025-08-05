import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get account ID from params
    const { accountId } = await params;
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify that the authenticated user owns the account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id, onboarding_data')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    
    if (onboardingError || !onboardingData) {
      console.error(`Resume closure API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }

    // Get backend configuration
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      console.error('Missing backend API configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Parse request body to get ACH relationship ID if provided
    type ResumeRequestBody = { ach_relationship_id?: string };
    let requestBody: ResumeRequestBody = {};
    try {
      requestBody = await request.json();
    } catch (error) {
      // Empty body is okay for resume
      requestBody = {};
    }

    // Extract ACH relationship ID from stored onboarding data as fallback
    const storedAchRelationshipId = onboardingData.onboarding_data?.ach_relationship_id;
    const achRelationshipId = requestBody.ach_relationship_id || storedAchRelationshipId;

    // Call backend API to resume closure process
    console.log(`Resuming account closure process for account ${accountId}`);
    const response = await fetch(`${backendUrl}/account-closure/resume/${accountId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
      body: JSON.stringify({
        ach_relationship_id: achRelationshipId
      }),
      cache: 'no-store'
    });

    const responseBody = await response.text();

    if (!response.ok) {
      let errorDetail = `Backend request failed with status: ${response.status}`;
      try {
        const errorJson = JSON.parse(responseBody);
        errorDetail = errorJson.detail || errorDetail;
      } catch (e) {
        // Ignore parse errors
      }
      console.error(`Account closure resume error: ${errorDetail}`);
      return NextResponse.json(
        { success: false, detail: errorDetail },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Failed to parse backend JSON response:", e);
      return NextResponse.json(
        { success: false, detail: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Account closure resume error:", error);
    return NextResponse.json(
      { success: false, detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 