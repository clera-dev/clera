import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { WeeklyStockPicksRecord, WeeklyStockPicksResponse, WeeklyStockPicksData } from '@/lib/types/weekly-stock-picks';

// Remove static fallback data loading - production-grade approach
// No more generic fallbacks, handle states properly

// Helper function to get the Monday of the current week in Pacific Time
function getMondayOfWeek(): string {
  const now = new Date();
  
  // Convert to Pacific Time
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  
  // Get the Monday of this week
  const dayOfWeek = pacificTime.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday is 0, Monday is 1
  
  const monday = new Date(pacificTime);
  monday.setDate(pacificTime.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  
  return monday.toISOString().split('T')[0]; // Return YYYY-MM-DD format
}

// Production-grade approach: No static fallbacks, handle states properly

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('User not authenticated in GET /api/investment/weekly-picks:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    console.log(`User ${user.id} requesting weekly stock picks.`);

    // Get the current week's Monday date
    const currentWeekMonday = getMondayOfWeek();
    
    // CRITICAL FIX: First check for CURRENT week data specifically
    const { data: currentWeekPicks, error: currentWeekError } = await supabase
      .from('user_weekly_stock_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_of', currentWeekMonday)  // Check CURRENT week specifically
      .maybeSingle();

    if (currentWeekError) {
      console.error(`Error fetching current week picks for user ${user.id}:`, currentWeekError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch weekly stock picks',
        data: null,
        metadata: {
          generated_at: new Date().toISOString(),
          week_of: currentWeekMonday,
          cached: false,
          fallback_reason: 'Database error occurred'
        }
      } as WeeklyStockPicksResponse);
    }

    // If no current week data, check for most recent data (for comparison/context)
    let mostRecentPicks = null;
    if (!currentWeekPicks) {
      const { data: recentData, error: recentError } = await supabase
        .from('user_weekly_stock_picks')
        .select('*')
        .eq('user_id', user.id)
        .order('week_of', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!recentError) {
        mostRecentPicks = recentData;
      }
    }

    // Use current week data if available, otherwise use most recent for reference
    const weeklyPicks = currentWeekPicks || mostRecentPicks;
    const picksError = currentWeekError;

    if (picksError) {
      console.error(`Error fetching weekly picks for user ${user.id}:`, picksError);
      // Return error state - don't mask database issues with fake data
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch weekly stock picks',
        data: null,
        metadata: {
          generated_at: new Date().toISOString(),
          week_of: currentWeekMonday,
          cached: false,
          fallback_reason: 'Database error occurred'
        }
      } as WeeklyStockPicksResponse);
    }

    // STEP 1: Analyze what data we have and what we need
    const hasCurrentWeekData = !!currentWeekPicks;
    const hasCurrentWeekError = currentWeekPicks?.status === 'error';
    const hasCurrentWeekInProgress = currentWeekPicks?.status && ['started', 'processing', 'sent_to_perplexity', 'parsing_response'].includes(currentWeekPicks.status);
    const hasCurrentWeekComplete = currentWeekPicks?.status === 'complete';

    console.log(`📊 Data analysis for user ${user.id}:`);
    console.log(`  - Has current week data: ${hasCurrentWeekData}`);
    console.log(`  - Current week status: ${currentWeekPicks?.status || 'none'}`);
    console.log(`  - Has most recent data: ${!!mostRecentPicks}`);
    console.log(`  - Most recent week: ${mostRecentPicks?.week_of || 'none'}`);
    console.log(`  - Current week: ${currentWeekMonday}`);

    // STEP 2: Handle current week in-progress generation
    if (hasCurrentWeekInProgress) {
      console.log(`⏳ Current week generation already in progress for user ${user.id} (status: ${currentWeekPicks.status})`);
      return NextResponse.json({
        success: true,
        data: null,
        metadata: {
          generated_at: null,
          week_of: currentWeekMonday,
          cached: false,
          fallback_reason: 'generation_in_progress',
          status: currentWeekPicks.status
        }
      } as WeeklyStockPicksResponse);
    }

    // STEP 3: Return current week data if it's complete
    if (hasCurrentWeekComplete) {
      console.log(`✅ Returning current week data for user ${user.id} (week: ${currentWeekMonday})`);
      const picksData: WeeklyStockPicksData = {
        stock_picks: currentWeekPicks.stock_picks,
        investment_themes: currentWeekPicks.investment_themes,
        market_analysis: currentWeekPicks.market_analysis,
        citations: currentWeekPicks.citations || []
      };

      return NextResponse.json({
        success: true,
        data: picksData,
        metadata: {
          generated_at: currentWeekPicks.generated_at,
          week_of: currentWeekPicks.week_of,
          cached: true,
          status: currentWeekPicks.status
        }
      } as WeeklyStockPicksResponse);
    }

    // STEP 4: Determine appropriate action for generation
    let generationReason = '';
    if (!hasCurrentWeekData) {
      if (!mostRecentPicks) {
        generationReason = 'new_user';
        console.log(`🚀 New user detected for ${user.id}, triggering immediate generation...`);
      } else {
        generationReason = 'new_week';
        console.log(`📅 User ${user.id} needs current week data (most recent: ${mostRecentPicks.week_of}, need: ${currentWeekMonday}), triggering generation...`);
      }
    } else if (hasCurrentWeekError) {
      generationReason = 'error_recovery';
      console.log(`🔄 Recovering from error status for user ${user.id}, triggering regeneration...`);
    } else {
      // This shouldn't happen with our logic above, but handle gracefully
      console.log(`⚠️ Unexpected state for user ${user.id}, triggering generation as fallback...`);
      generationReason = 'fallback';
    }
    
    try {
      // CRITICAL: IMMEDIATELY claim this generation slot to prevent race conditions
      console.log(`🔒 IMMEDIATELY claiming generation slot for user ${user.id}...`);
      
      const { error: claimError } = await supabase
        .from('user_weekly_stock_picks')
        .upsert({
          user_id: user.id,
          week_of: currentWeekMonday, // Always use current week for new generation
          status: 'started', // IMMEDIATELY mark as started
          stock_picks: [],
          investment_themes: [],
          market_analysis: { current_environment: '', risk_factors: '', opportunities: '' },
          citations: [],
          generated_at: new Date().toISOString(),
          model: 'sonar-deep-research'
        }, { 
          onConflict: 'user_id,week_of',
          ignoreDuplicates: false 
        });

      if (claimError) {
        console.error(`❌ Failed to claim generation slot for user ${user.id}:`, claimError);
        return NextResponse.json({
          success: false,
          error: 'Failed to start generation process. Please try again.',
          data: null,
          metadata: {
            generated_at: null,
            week_of: currentWeekMonday,
            cached: false,
            fallback_reason: 'claim_failed',
            generation_reason: generationReason
          }
        } as WeeklyStockPicksResponse);
      }

      console.log(`✅ Generation slot claimed for user ${user.id}. Starting actual generation...`);

      // Create Supabase client with service role permissions for generation  
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const supabaseService = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Import the generation function from our new utility
      const { generateStockPicksForUser } = await import('@/utils/services/weekly-stock-picks-generator');
      
      console.log(`🔄 Generating stock picks on-demand for new user ${user.id}...`);
      
      // Generate picks immediately (like daily news does)
      // Note: generateStockPicksForUser now handles UPSERT internally
      const newPicksRecord = await generateStockPicksForUser(user.id, supabaseService);
      
      if (!newPicksRecord) {
        console.error(`❌ Failed to generate picks for user ${user.id}`);
        return NextResponse.json({
          success: false,
          error: 'Failed to generate personalized picks. Please try again.',
          data: null,
          metadata: {
            generated_at: null,
            week_of: currentWeekMonday,
            cached: false,
            fallback_reason: 'generation_failed',
            generation_reason: generationReason
          }
        } as WeeklyStockPicksResponse);
      }

      console.log(`🎉 Successfully generated and saved picks for new user ${user.id}`);

      // Return the freshly generated data
      const picksData: WeeklyStockPicksData = {
        stock_picks: newPicksRecord.stock_picks,
        investment_themes: newPicksRecord.investment_themes,
        market_analysis: newPicksRecord.market_analysis || {
          current_environment: '',
          risk_factors: '',
          opportunities: ''
        },
        citations: newPicksRecord.citations || []
      };

      return NextResponse.json({
        success: true,
        data: picksData,
        metadata: {
          generated_at: newPicksRecord.generated_at,
          week_of: newPicksRecord.week_of,
          cached: false,
          status: newPicksRecord.status || 'complete',
          generation_reason: generationReason
        }
      } as WeeklyStockPicksResponse);

    } catch (generationError: any) {
      console.error(`❌ Error during on-demand generation for user ${user.id}:`, generationError);
      return NextResponse.json({
        success: false,
        error: 'Failed to generate personalized picks. Our AI is currently busy, please try again shortly.',
        data: null,
        metadata: {
          generated_at: null,
          week_of: currentWeekMonday,
          cached: false,
          fallback_reason: 'generation_error',
          generation_reason: generationReason
        }
      } as WeeklyStockPicksResponse);
    }

  } catch (error: any) {
    console.error('Error in GET /api/investment/weekly-picks:', error);
    
    // Return error state - don't mask service issues with fake data
    return NextResponse.json({
      success: false,
      error: 'Service temporarily unavailable',
      data: null,
      metadata: {
        generated_at: null,
        week_of: getMondayOfWeek(),
        cached: false,
        fallback_reason: 'service_error'
      }
    } as WeeklyStockPicksResponse);
  }
}


 