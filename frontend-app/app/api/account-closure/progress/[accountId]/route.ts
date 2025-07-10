import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const { accountId } = await params;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Account Closure Progress API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify that the authenticated user owns the accountId
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .eq('alpaca_account_id', accountId)
      .single();
    if (onboardingError || !onboardingData) {
      console.error(`Account Closure Progress API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }

    // Call backend to get current closure progress
    const backendUrl = process.env.BACKEND_API_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;
    
    if (!backendUrl || !backendApiKey) {
      console.error('Backend API configuration not found');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/api/account-closure/progress/${accountId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': backendApiKey,
      },
    });

    if (!response.ok) {
      console.error(`Backend responded with status ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch closure progress' },
        { status: response.status }
      );
    }

    const progressData = await response.json();
    
    return NextResponse.json(progressData);

  } catch (error) {
    console.error('Error fetching account closure progress:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 