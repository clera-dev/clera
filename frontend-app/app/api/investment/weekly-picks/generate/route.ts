import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { claimWeeklyPicksSlot } from '@/utils/db/atomic-claim';
import { generateStockPicksForUser } from '@/utils/services/weekly-stock-picks-generator';
import { OpenAI } from 'openai';

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

    // Use service-role client for generation ops
    const { createClient: createServiceClient } = await import('@supabase/supabase-js');
    const supabaseService = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Atomic claim prevents duplicate costly runs
    const claim = await claimWeeklyPicksSlot(supabaseService, user.id, weekOf, 'sonar-deep-research');
    if (!claim.claimed) {
      return NextResponse.json({
        success: true,
        data: null,
        metadata: {
          generated_at: null,
          week_of: weekOf,
          cached: false,
          fallback_reason: 'generation_in_progress'
        }
      });
    }

    // Create Perplexity client (server-only) and inject into generator
    const perplexityClient = new OpenAI({
      apiKey: process.env.PPLX_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });

    const record = await generateStockPicksForUser(user.id, supabaseService, perplexityClient);
    if (!record) {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, week_of: record.week_of, generated_at: record.generated_at });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


