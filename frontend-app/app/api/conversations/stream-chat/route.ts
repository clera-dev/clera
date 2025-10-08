import { NextRequest, NextResponse } from 'next/server';
import { randomUUID as nodeRandomUUID, randomBytes } from 'crypto';
import { LangGraphStreamingService } from '@/utils/services/langGraphStreamingService';
import { ConversationAuthService } from '@/utils/api/conversation-auth';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { ToolEventStore } from '@/lib/server/ToolEventStore';

// CRITICAL FIX: Set maximum duration for LangGraph agent processing (up to 800 seconds on Pro/Enterprise)
export const maxDuration = 299; // ~5 minutes for complex agent workflows

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, run_id } = body;

    // Extract account ID (optional for aggregation-only users)
    const account_id = ConversationAuthService.extractAccountId(body, 'account_id');

    if (!thread_id || !input) {
      return NextResponse.json(
        { error: 'Thread ID and input are required' },
        { status: 400 }
      );
    }

    // Use centralized authentication and authorization service
    // account_id can be null for Plaid-only users
    const authResult = await ConversationAuthService.authenticateAndAuthorize(request, account_id);
    if (!authResult.success) {
      // Convert NextResponse to streaming error response
      const errorData = await authResult.error!.json();
      const status = authResult.error!.status;
      return LangGraphStreamingService.createErrorStreamingResponse(errorData.error, status);
    }

    const { user, accountId: validatedAccountId } = authResult.context!;

    // Create streaming service instance
    const streamingService = LangGraphStreamingService.create();
    if (!streamingService) {
      return LangGraphStreamingService.createErrorStreamingResponse(
        'Server misconfiguration: LangGraph API credentials are missing.', 
        500
      );
    }

    console.log('[StreamChat] Starting stream via LangGraphStreamingService for thread:', thread_id);

    // Validate or safely resolve run_id to avoid hijacking or overwriting existing runs
    const secureRandomUUID = (): string => {
      // Prefer Web Crypto if available
      const g: any = globalThis as any;
      if (g?.crypto && typeof g.crypto.randomUUID === 'function') {
        try { return g.crypto.randomUUID(); } catch {}
      }
      // Fallback to Node crypto randomUUID
      if (typeof nodeRandomUUID === 'function') {
        try { return nodeRandomUUID(); } catch {}
      }
      // Final fallback: RFC4122 v4 from secure random bytes
      const bytes = randomBytes(16);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xxxxxx
      const hex = bytes.toString('hex');
      return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
    };
    const supabase = await createServerSupabase();
    const isValidUuidV4 = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    let safeRunId: string;
    if (isValidUuidV4(run_id)) {
      // Check if the run already exists; only allow reuse if it belongs to this user and thread
      const { data: existing, error: selErr } = await supabase
        .from('chat_runs')
        .select('id, user_id, thread_id')
        .eq('id', run_id)
        .limit(1)
        .maybeSingle();
      if (!selErr && existing && existing.user_id === user.id && existing.thread_id === thread_id) {
        safeRunId = run_id;
      } else {
        safeRunId = secureRandomUUID();
      }
    } else {
      safeRunId = secureRandomUUID();
    }

    // Create streaming response using the service for consistency
    return streamingService.createStreamingResponse({
      threadId: thread_id,
      streamConfig: {
        input: input,
        config: LangGraphStreamingService.createSecureConfig(user.id, validatedAccountId)
      },
      onError: (error) => {
        console.error('[StreamChat] LangGraph streaming error:', error);
      },
      // Provide persistence context
      runId: safeRunId,
      userId: user.id,
      accountId: validatedAccountId ?? undefined,
      // Persistence callbacks
      onRunStart: async (runId, threadId, userId, accountId) => {
        await ToolEventStore.startRun({ runId, threadId, userId, accountId: accountId || '' });
      },
      onToolStart: async (runId, toolKey, toolLabel, agent) => {
        await ToolEventStore.upsertToolStart({ runId, toolKey, toolLabel, agent });
      },
      onToolComplete: async (runId, toolKey, status) => {
        await ToolEventStore.upsertToolComplete({ runId, toolKey, status });
      },
      onRunFinalize: async (runId, status) => {
        await ToolEventStore.finalizeRun({ runId, status });
      },
    });

  } catch (error: any) {
    console.error('[StreamChat] Error in stream-chat API:', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
} 