import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { WeeklyStockPicksRecord, WeeklyStockPicksResponse, WeeklyStockPicksData } from '@/lib/types/weekly-stock-picks';

/*
 * TEMPORARY COST OPTIMIZATION: STATIC FALLBACK MODE
 * 
 * This API route has been temporarily modified to serve static data instead of
 * running expensive Perplexity Deep Research generation for each user.
 * 
 * CHANGES MADE:
 * - Disabled on-demand generation logic
 * - All users receive the same high-quality static data
 * - Preserves the same API interface for frontend compatibility
 * 
 * TO RESTORE PRODUCTION FUNCTIONALITY:
 * 1. Remove the static service import and calls
 * 2. Uncomment the complex generation logic below
 * 3. Re-enable the cron job in vercel.json
 * 4. Delete the static fallback service and data files
 * 
 * @see lib/services/static-weekly-picks-service.ts - Static data provider
 * @see lib/data/static-weekly-picks-fallback.json - Static data source
 */

// TEMPORARY: Static fallback service for cost optimization
import { loadStaticWeeklyPicks, STATIC_FALLBACK_METADATA } from '@/lib/services/static-weekly-picks-service';
// import { claimWeeklyPicksSlot } from '@/utils/db/atomic-claim'; // Uncomment when restoring production logic

// Helper: DST-safe Pacific Monday computation (no locale string parsing)
function getMondayOfWeek(): string {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const parts = dtf.formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  const year = Number(part('year'));
  const month = Number(part('month'));
  const day = Number(part('day'));
  const weekdayShort = part('weekday');
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekdayShort] ?? 0;
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const baseUtcMs = Date.UTC(year, month - 1, day);
  const mondayUtc = new Date(baseUtcMs + mondayOffset * 86400000);
  return mondayUtc.toISOString().split('T')[0];
}

/*
 * COMMENTED OUT: Original complex generation logic for production restoration
 * 
 * This logic handles personalized generation, database queries, error states,
 * and on-demand Perplexity API calls. Uncomment when ready to restore production.
 * 
// Production-grade approach: No static fallbacks, handle states properly
export async function GET_ORIGINAL_PRODUCTION_LOGIC(request: NextRequest) {
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
*/

// TEMPORARY: Simplified static data API for cost optimization
export async function GET(request: NextRequest) {
  try {
    // Still authenticate user for security
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('User not authenticated in GET /api/investment/weekly-picks:', authError);
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    console.log(`🎯 [STATIC MODE] User requesting weekly stock picks - serving static data`);

    // Load static data instead of generating personalized content
    const staticData = await loadStaticWeeklyPicks();

    const picksData: WeeklyStockPicksData = {
      stock_picks: staticData.stock_picks,
      investment_themes: staticData.investment_themes,
      market_analysis: staticData.market_analysis,
      citations: staticData.citations
    };

    return NextResponse.json({
      success: true,
      data: picksData,
      metadata: {
        generated_at: staticData.generated_at,
        week_of: staticData.week_of,
        cached: true,
        fallback_reason: STATIC_FALLBACK_METADATA.reason,
        status: 'complete'
      }
    } as WeeklyStockPicksResponse);

  } catch (error: any) {
    console.error('Error in GET /api/investment/weekly-picks (static mode):', error);
    
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
    } as WeeklyStockPicksResponse, { status: 500 });
  }
}

/*
 * COMMENTED OUT: Remainder of original production logic
 * 
 * The following code handled database queries, error states, and Perplexity generation.
 * Uncomment and restore when ready to re-enable production functionality.
 * 
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
      } as WeeklyStockPicksResponse, { status: 500 });
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
      } as WeeklyStockPicksResponse, { status: 500 });
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

      // SECURITY & ARCHITECTURE: Do NOT use service-role in a user-facing GET route.
      // Instead, delegate generation to a secure POST endpoint or background job.
      // Here we simply signal that generation has started and let the client poll.
      // To trigger generation, call POST /api/investment/weekly-picks/generate (CSRF-protected).
      return NextResponse.json({
        success: true,
        data: null,
        metadata: {
          generated_at: null,
          week_of: currentWeekMonday,
          cached: false,
          fallback_reason: 'generation_in_progress',
          generation_reason: generationReason
        }
      } as WeeklyStockPicksResponse);
      
      // NOTE: Previous synchronous generation code removed to uphold least-privilege.
      // See POST /api/investment/weekly-picks/generate for secure generation flow.

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
      } as WeeklyStockPicksResponse, { status: 500 });
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
    } as WeeklyStockPicksResponse, { status: 500 });
  }
}


 */