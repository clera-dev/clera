import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
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

    // Get closure data from Supabase
    const { data: onboardingData, error: fetchError } = await supabase
      .from('user_onboarding')
      .select(`
        account_closure_confirmation_number,
        account_closure_initiated_at,
        account_closure_completed_at,
        status,
        onboarding_data
      `)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      // GRACEFUL HANDLING: If no row is found (PGRST116), it's not a server error.
      // It simply means the user has not started the onboarding/closure process.
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          data: null,
        });
      }

      console.error('Error fetching closure data:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch closure data' },
        { status: 500 }
      );
    }

    if (!onboardingData) {
      return NextResponse.json(
        { error: 'No closure data found' },
        { status: 404 }
      );
    }

    // CRITICAL FIX: Only return closure data if account closure has actually been initiated
    // Check if confirmation number exists (this indicates closure was initiated)
    if (!onboardingData.account_closure_confirmation_number) {
      // No closure activity - return null to indicate no closure
      return NextResponse.json({
        success: true,
        data: null
      });
    }

    // Extract closure-specific data from onboarding_data JSONB
    const closureData = onboardingData.onboarding_data?.account_closure || {};

    return NextResponse.json({
      success: true,
      data: {
        confirmationNumber: onboardingData.account_closure_confirmation_number,
        initiatedAt: onboardingData.account_closure_initiated_at,
        completedAt: onboardingData.account_closure_completed_at,
        status: onboardingData.status,
        estimatedCompletion: closureData.estimated_completion || '3-5 business days',
        nextSteps: closureData.next_steps || [
          'Positions are being liquidated',
          'Funds will be transferred to your connected bank account',
          'You will receive email confirmations throughout the process'
        ]
      }
    });

  } catch (error) {
    console.error('Error in account closure data endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 