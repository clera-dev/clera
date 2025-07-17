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

    // CRITICAL SECURITY FIX: Validate that the user owns this account
    const { data: onboardingData, error: ownershipError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id, status')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();

git     if (ownershipError) {
      console.error('Database error during account closure ownership check:', ownershipError);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
    if (!onboardingData) {
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }

    // CRITICAL: Only allow closure if account is in pending_closure status
    if (onboardingData.status !== 'pending_closure') {
      return NextResponse.json(
        { error: 'Account must be in pending closure status to be closed' },
        { status: 400 }
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

    // Call backend API to close account
    console.log(`Closing account permanently: ${accountId} by user ${user.id}`);
    const response = await fetch(`${backendUrl}/account-closure/close-account/${accountId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
      body: JSON.stringify({
        final_confirmation: true
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
      console.error(`Account closure error: ${errorDetail}`);
      return NextResponse.json(
        { detail: errorDetail },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseBody);
    } catch (e) {
      console.error("Failed to parse backend JSON response:", e);
      return NextResponse.json(
        { detail: 'Invalid response from backend service' },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error("Account closure error:", error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 