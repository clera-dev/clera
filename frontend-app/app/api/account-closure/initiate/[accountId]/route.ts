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

    if (ownershipError || !onboardingData) {
      console.error(`User ${user.id} attempted to close account ${accountId} they don't own`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }

    // CRITICAL: Prevent closure if account is already in closure process
    if (onboardingData.status === 'pending_closure' || onboardingData.status === 'closed') {
      return NextResponse.json(
        { error: 'Account is already in closure process or has been closed' },
        { status: 400 }
      );
    }

    // CRITICAL FIX: Read and validate request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate required fields
    const { ach_relationship_id, confirm_liquidation, confirm_irreversible } = requestBody;
    
    if (!ach_relationship_id) {
      return NextResponse.json(
        { error: 'ACH relationship ID is required' },
        { status: 400 }
      );
    }

    if (!confirm_liquidation || !confirm_irreversible) {
      return NextResponse.json(
        { error: 'Both liquidation and irreversible action confirmations are required' },
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

    // Call backend API to initiate closure
    console.log(`Initiating account closure for account ${accountId} by user ${user.id}`);
    const response = await fetch(`${backendUrl}/account-closure/initiate/${accountId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
      body: JSON.stringify({
        ach_relationship_id,
        confirm_liquidation,
        confirm_irreversible
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
      console.error(`Account closure initiation error: ${errorDetail}`);
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
    console.error("Account closure initiation error:", error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
} 