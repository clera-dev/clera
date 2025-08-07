import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * API route to get current user's onboarding status
 * 
 * SECURITY: This route uses Supabase session authentication (cookies)
 * and only returns data for the authenticated user.
 * 
 * This replaces direct client-side database queries to maintain
 * proper architectural boundaries and security.
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user using Supabase session
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('User Status API: User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`User Status API: Getting status for user: ${user.id}`);

    // Get user's onboarding data and status
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('status, alpaca_account_id, created_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (onboardingError) {
      console.error(`User Status API: Database error for user ${user.id}:`, onboardingError);
      return NextResponse.json(
        { error: 'Failed to fetch user status' },
        { status: 500 }
      );
    }

    if (!onboardingData) {
      // User hasn't started onboarding yet
      return NextResponse.json({
        userId: user.id,
        status: null,
        hasOnboardingData: false
      });
    }

    // Return user status data
    return NextResponse.json({
      userId: user.id,
      status: onboardingData.status,
      alpacaAccountId: onboardingData.alpaca_account_id,
      hasOnboardingData: true,
      createdAt: onboardingData.created_at,
      updatedAt: onboardingData.updated_at
    });

  } catch (error: any) {
    console.error('User Status API: Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';