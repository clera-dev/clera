import { NextRequest, NextResponse } from 'next/server';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

// Read-only fetch of tool activities should be a GET to align with REST semantics
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const thread_id = url.searchParams.get('thread_id');
    const account_id = url.searchParams.get('account_id');
    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam !== null ? Number(limitParam) : 25;
    const safeLimitFloat = Number.isNaN(parsedLimit) ? 25 : parsedLimit;
    const safeLimit = Math.trunc(safeLimitFloat);
    if (!thread_id || !account_id) {
      return NextResponse.json({ error: 'thread_id and account_id are required' }, { status: 400 });
    }

    // Reuse centralized auth (validates JWT + account ownership)
    const auth = await ConversationAuthService.authenticateAndAuthorize(request, account_id);
    if (!auth.success) {
      const err = await auth.error!.json();
      return NextResponse.json({ error: err.error }, { status: auth.error!.status });
    }
    const { user, supabase } = auth.context!;
    // Fetch last N runs for this thread (user constrained via RLS)
    const { data: runs, error: runsErr } = await supabase
      .from('chat_runs')
      .select('id, started_at, ended_at, status')
      .eq('thread_id', thread_id)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, safeLimit)))
      ;
    if (runsErr) {
      return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({ runs: [] });
    }

    const runIds = runs.map((r: any) => r.id);
    const { data: tools, error: toolsErr } = await supabase
      .from('chat_tool_calls')
      .select('run_id, tool_key, tool_label, agent, status, started_at, completed_at, metadata')
      .in('run_id', runIds)
      .order('started_at', { ascending: true });
    if (toolsErr) {
      return NextResponse.json({ error: 'Failed to fetch tool calls' }, { status: 500 });
    }

    // Group tool calls under runs
    const runIdToTools: Record<string, any[]> = {};
    for (const t of tools || []) {
      (runIdToTools[t.run_id] ||= []).push(t);
    }
    const result = runs.map((r: any) => ({
      run_id: r.id,
      started_at: r.started_at,
      ended_at: r.ended_at,
      status: r.status,
      tool_calls: (runIdToTools[r.id] || []).map((t) => ({
        tool_key: t.tool_key,
        tool_label: t.tool_label,
        agent: t.agent,
        status: t.status,
        started_at: t.started_at,
        completed_at: t.completed_at,
        metadata: t.metadata,
      })),
    }));

    return NextResponse.json({ runs: result });
  } catch (e: any) {
    // Do not leak internal error details to the client
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


