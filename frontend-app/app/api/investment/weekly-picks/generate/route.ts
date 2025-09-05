import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { enqueueWeeklyPicksGeneration, getJobStatus } from '@/utils/jobs/weekly-picks-queue';

// DST-safe Pacific Monday computation
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

function isOriginAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const allowed = (process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return false;
  // Check Origin exact match or Referer prefix match
  return allowed.some(a => origin === a || referer.startsWith(a));
}

export async function POST(request: NextRequest) {
  // Feature flag: keep disabled in static fallback mode
  if (process.env.ENABLE_WEEKLY_PICKS_GENERATION !== 'true') {
    return NextResponse.json({ error: 'Generation disabled' }, { status: 403 });
  }

  // CSRF protection: enforce same-origin via Origin/Referer validation
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Authenticate user (session-bound, prevents CSRF via victim session misuse)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const weekOf = getMondayOfWeek();

    // SECURITY FIX: Use user-scoped Supabase client and proper job enqueueing
    // instead of directly using service role key in user-facing endpoint.
    // This maintains proper architectural boundaries and least-privilege access.
    
    // Check current job/generation status first
    const jobStatus = await getJobStatus(supabase, user.id, weekOf);
    
    if (jobStatus.status === 'processing' || jobStatus.status === 'pending') {
      return NextResponse.json({
        success: true,
        data: null,
        metadata: {
          generated_at: null,
          week_of: weekOf,
          cached: false,
          fallback_reason: 'generation_in_progress',
          job_status: jobStatus.status
        }
      });
    }

    if (jobStatus.status === 'completed') {
      return NextResponse.json({
        success: true,
        data: null,
        metadata: {
          generated_at: new Date().toISOString(),
          week_of: weekOf,
          cached: true,
          fallback_reason: 'already_completed'
        }
      });
    }

    // Determine generation reason for job prioritization
    let reason: 'new_user' | 'new_week' | 'error_recovery' | 'manual_trigger' = 'manual_trigger';
    if (jobStatus.status === 'failed') {
      reason = 'error_recovery';
    } else if (jobStatus.status === 'not_found') {
      // Check if this is a new user (no previous picks)
      const { data: previousPicks } = await supabase
        .from('user_weekly_stock_picks')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      reason = previousPicks?.length ? 'new_week' : 'new_user';
    }

    // Enqueue generation job for background processing
    // This delegates heavy work to background workers with proper service role access
    const enqueueResult = await enqueueWeeklyPicksGeneration(
      supabase, 
      user.id, 
      weekOf, 
      reason, 
      reason === 'new_user' ? 'high' : 'normal'
    );

    if (!enqueueResult.success) {
      return NextResponse.json({ 
        error: enqueueResult.reason || 'Failed to start generation' 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: null,
      metadata: {
        generated_at: null,
        week_of: weekOf,
        cached: false,
        fallback_reason: 'generation_queued',
        job_id: enqueueResult.jobId,
        generation_reason: reason
      }
    });

  } catch (e: any) {
    console.error('Error in weekly picks generation endpoint:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


