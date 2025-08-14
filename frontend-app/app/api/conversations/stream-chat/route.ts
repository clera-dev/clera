import { NextRequest, NextResponse } from 'next/server';
import { LangGraphStreamingService } from '@/utils/services/langGraphStreamingService';
import { ConversationAuthService } from '@/utils/api/conversation-auth';
import { createClient as createServerSupabase } from '@/utils/supabase/server';

// CRITICAL FIX: Set maximum duration for LangGraph agent processing (up to 800 seconds on Pro/Enterprise)
export const maxDuration = 299; // ~5 minutes for complex agent workflows

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, run_id } = body;

    // Extract and validate account ID
    const account_id = ConversationAuthService.extractAccountId(body, 'account_id');

    if (!thread_id || !input || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, input, and account ID are required' },
        { status: 400 }
      );
    }

    // Use centralized authentication and authorization service
    const authResult = await ConversationAuthService.authenticateAndAuthorize(request, account_id);
    if (!authResult.success) {
      // Convert NextResponse to streaming error response
      const errorData = await authResult.error!.json();
      const status = authResult.error!.status;
      return LangGraphStreamingService.createErrorStreamingResponse(errorData.error, status);
    }

    const { user } = authResult.context!;

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
        safeRunId = typeof crypto !== 'undefined' && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              const v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
      }
    } else {
      safeRunId = typeof crypto !== 'undefined' && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
    }

    // Create streaming response using the service for consistency
    return streamingService.createStreamingResponse({
      threadId: thread_id,
      streamConfig: {
        input: input,
        config: LangGraphStreamingService.createSecureConfig(user.id, account_id)
      },
      onError: (error) => {
        console.error('[StreamChat] LangGraph streaming error:', error);
      },
      // Provide persistence context
      runId: safeRunId,
      userId: user.id,
      accountId: account_id,
    });

  } catch (error: any) {
    console.error('[StreamChat] Error in stream-chat API:', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
} 