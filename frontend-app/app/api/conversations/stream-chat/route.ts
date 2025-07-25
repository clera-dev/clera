import { NextRequest, NextResponse } from 'next/server';
import { LangGraphStreamingService } from '@/utils/services/langGraphStreamingService';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, user_id } = body;

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

    // Create streaming response using the service for consistency
    return streamingService.createStreamingResponse({
      threadId: thread_id,
      streamConfig: {
        input: input,
        config: LangGraphStreamingService.createSecureConfig(user.id, account_id)
      },
      // CRITICAL FIX: Use the service's optimized streamMode for consistent event handling
      // This ensures both normal streaming and interrupt handling use the same event format
      streamMode: ['updates', 'messages'],
      onError: (error) => {
        console.error('[StreamChat] LangGraph streaming error:', error);
      }
    });

  } catch (error: any) {
    console.error('[StreamChat] Error in stream-chat API:', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
} 