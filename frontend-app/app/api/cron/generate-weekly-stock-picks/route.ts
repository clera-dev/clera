import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { generateStockPicksForUser } from '@/utils/services/weekly-stock-picks-generator';
import { OpenAI } from 'openai';
// Helper function to get Monday of the current week in Pacific Time (DST-safe, locale-agnostic)
function getMondayOfWeek(): string {
  const now = new Date();

  // Use Intl.DateTimeFormat with timeZone + formatToParts to get PT calendar parts reliably
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
  const weekdayShort = part('weekday'); // e.g., 'Mon', 'Tue'

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekdayShort] ?? 0;

  // Offset to Monday (PT calendar). If Sunday (0), go back 6 days
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  // Construct a UTC date from PT calendar parts, then add offset in day units.
  // Operating in UTC avoids DST-related wall-clock shifts.
  const baseUtcMs = Date.UTC(year, month - 1, day);
  const mondayUtc = new Date(baseUtcMs + mondayOffset * 86400000);

  // Return ISO date (YYYY-MM-DD) of the PT Monday label
  return mondayUtc.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  // Basic authorization check for cron job security
  const authHeader = request.headers.get('Authorization');
  const expectedHeader = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!process.env.CRON_SECRET || authHeader !== expectedHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('🚀 CRON: Starting weekly stock picks generation job...');

  try {
    // Create Supabase client with service role permissions for cron operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all active users with Alpaca accounts
    const { data: users, error: usersError } = await supabase
      .from('user_onboarding')
      .select('user_id, alpaca_account_id')
      .not('alpaca_account_id', 'is', null);

    if (usersError) {
      console.error('CRON: Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users', details: usersError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      console.log('CRON: No users found for weekly stock picks generation.');
      return NextResponse.json({ message: 'No users to process' });
    }

    console.log(`CRON: Found ${users.length} users to process for weekly stock picks.`);

    const weekOf = getMondayOfWeek();
    let successCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 3; // Process in small batches to avoid overwhelming Perplexity API

    // Process users in batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      console.log(`CRON: Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(users.length / BATCH_SIZE)}`);
      
      const batchPromises = batch.map(async (user) => {
        try {
          // Check if we already have picks for this user this week
          const { data: existingPicks } = await supabase
            .from('user_weekly_stock_picks')
            .select('id, status')
            .eq('user_id', user.user_id)
            .eq('week_of', weekOf)
            .limit(1);
          
            if (existingPicks && existingPicks.length > 0 && existingPicks[0].status === 'completed') {
            console.log(`CRON: Skipping user ${user.user_id} - already has picks for week ${weekOf} (status: ${existingPicks[0].status})`);
            return { success: true, skipped: true };
          }
          
          // CRITICAL: IMMEDIATELY claim this generation slot to prevent race conditions
          console.log(`🔒 CRON: IMMEDIATELY claiming generation slot for user ${user.user_id}...`);
          
          const { error: claimError } = await supabase
            .from('user_weekly_stock_picks')
            .upsert({
              user_id: user.user_id,
              week_of: weekOf,
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
            console.error(`❌ CRON: Failed to claim generation slot for user ${user.user_id}:`, claimError);
            return { success: false, userId: user.user_id };
          }

          console.log(`✅ CRON: Generation slot claimed for user ${user.user_id}. Starting actual generation...`);
          
          // Create Perplexity client (server-only) and inject into generator
          const perplexityClient = new OpenAI({
            apiKey: process.env.PPLX_API_KEY,
            baseURL: 'https://api.perplexity.ai',
          });
          
          // Generate stock picks using the shared utility
          // Note: generateStockPicksForUser now handles UPSERT internally
          const stockPicksRecord = await generateStockPicksForUser(user.user_id, supabase, perplexityClient);
          
          if (!stockPicksRecord) {
            console.error(`CRON: Failed to generate stock picks for user ${user.user_id}`);
            return { success: false, userId: user.user_id };
          }
          
          console.log(`🎉 CRON: Successfully generated and saved weekly stock picks for user ${user.user_id}`);
          return { success: true, userId: user.user_id };
          
        } catch (userError: any) {
          console.error(`CRON: Error processing user ${user.user_id}:`, userError.message);
          return { success: false, userId: user.user_id };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Count results
      batchResults.forEach(result => {
        if (result.success && !result.skipped) {
          successCount++;
        } else if (!result.success) {
          errorCount++;
        }
      });
      
      // Add delay between batches to be respectful to the API
      if (i + BATCH_SIZE < users.length) {
        console.log('CRON: Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    console.log(`🎉 CRON: Weekly stock picks generation completed. Success: ${successCount}, Errors: ${errorCount}`);
    
    return NextResponse.json({ 
      message: 'Weekly stock picks generation completed',
      statistics: {
        total_users: users.length,
        successful_generations: successCount,
        errors: errorCount,
        week_of: weekOf
      }
    });

  } catch (error: any) {
    console.error('❌ CRON: Weekly stock picks cron job failed:', error);
    return NextResponse.json({ 
      error: 'Weekly stock picks cron job failed', 
      details: error.message 
    }, { status: 500 });
  }
}