import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Get the user from Supabase
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Funding Status API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`Funding Status API: Checking funding status for account: ${accountId}, user: ${user.id}`);

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
      console.error(`Funding Status API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Funding Status API: Ownership verified. User ${user.id} owns account ${accountId}`);

    // Call the backend funding status endpoint
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    const apiKey = process.env.BACKEND_API_KEY;
    
    if (!apiKey) {
      console.error('Funding Status API: BACKEND_API_KEY not found');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/api/account/${accountId}/funding-status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Funding Status API: Backend error:', errorData);
      throw new Error(`Backend error: ${response.status} ${errorData}`);
    }

    const responseData = await response.json();
    console.log('Funding Status API: Backend response:', responseData);

    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('Funding Status API: Unexpected error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 