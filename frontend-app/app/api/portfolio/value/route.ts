import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Portfolio value API route handler
export async function GET(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Portfolio Value API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get account ID from query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    console.log(`Portfolio Value API: Getting value for account: ${accountId}, user: ${user.id}`);

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
      console.error(`Portfolio Value API: User ${user.id} does not own account ${accountId}`);
      return NextResponse.json(
        { error: 'Account not found or access denied' },
        { status: 403 }
      );
    }
    
    console.log(`Portfolio Value API: Ownership verified. User ${user.id} owns account ${accountId}`);

    // Fetch portfolio data from backend API with API key
    const backendUrl = process.env.BACKEND_API_URL;
    const url = `${backendUrl}/api/portfolio/value?accountId=${accountId}&user_id=${user.id}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY || '',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch portfolio value: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in portfolio value API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 