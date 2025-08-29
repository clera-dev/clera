import { SupabaseClient } from '@supabase/supabase-js';

type ClaimResult = {
  claimed: boolean;
  reason:
    | 'updated-existing'
    | 'inserted-new'
    | 'already-started'
    | 'conflict-existing'
    | 'update_error'
    | 'insert_error';
};

/**
 * Atomically claim a weekly generation slot for a user/week.
 *
 * Strategy (race-safe):
 * 1) Try conditional UPDATE ... WHERE status IN ('pending','error'). If 1 row -> claimed.
 * 2) If 0 rows updated, try INSERT started-row. If unique violation -> someone else won.
 */
export async function claimWeeklyPicksSlot(
  supabase: SupabaseClient,
  userId: string,
  weekOf: string,
  model: string
): Promise<ClaimResult> {
  const nowIso = new Date().toISOString();

  // Step 1: Conditional update on existing row
  const { data: updatedRows, error: updateError } = await supabase
    .from('user_weekly_stock_picks')
    .update({
      status: 'started',
      stock_picks: [],
      investment_themes: [],
      market_analysis: { current_environment: '', risk_factors: '', opportunities: '' },
      citations: [],
      generated_at: nowIso,
      model
    })
    .eq('user_id', userId)
    .eq('week_of', weekOf)
    .in('status', ['pending', 'error'])
    .select('id');

  if (updateError) {
    return { claimed: false, reason: 'update_error' };
  }

  if (updatedRows && updatedRows.length > 0) {
    return { claimed: true, reason: 'updated-existing' };
  }

  // Step 2: Insert a new started row (if it doesn't exist)
  const { data: insertedRows, error: insertError } = await supabase
    .from('user_weekly_stock_picks')
    .insert([
      {
        user_id: userId,
        week_of: weekOf,
        status: 'started',
        stock_picks: [],
        investment_themes: [],
        market_analysis: { current_environment: '', risk_factors: '', opportunities: '' },
        citations: [],
        generated_at: nowIso,
        model
      }
    ])
    .select('id');

  // Unique violation means someone else inserted first
  // Supabase error may include a Postgres code
  if (insertError && (insertError.code === '23505' || /duplicate key/i.test(String(insertError.message)))) {
    return { claimed: false, reason: 'conflict-existing' };
  }

  if (insertError) {
    return { claimed: false, reason: 'insert_error' };
  }

  if (insertedRows && insertedRows.length > 0) {
    return { claimed: true, reason: 'inserted-new' };
  }

  return { claimed: false, reason: 'already-started' };
}


