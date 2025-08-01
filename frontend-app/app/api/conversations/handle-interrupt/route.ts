import { NextRequest, NextResponse } from 'next/server';
import { LangGraphStreamingService } from '@/utils/services/langGraphStreamingService';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

// CRITICAL FIX: Set maximum duration for LangGraph interrupt handling
export const maxDuration = 800; // 13+ minutes for complex agent workflows

/**
 * Handles interrupt resumption for LangGraph conversations
 * 
 * This endpoint allows resuming interrupted LangGraph runs by providing
 * a response to the interrupt. Both GET and POST methods are supported
 * for backwards compatibility.
 */

async function handleInterruptLogic(
  thread_id: string,
  run_id: string,
  response: any,
  account_id: string,
  request: NextRequest
): Promise<NextResponse> {
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

  // SECURITY: Never log sensitive user content or PII
  console.log(`Handling interrupt for thread.`);

  // Create streaming response using the service
  return streamingService.createStreamingResponse({
    threadId: thread_id,
    streamConfig: {
      input: null,
      command: { resume: response },
      config: LangGraphStreamingService.createSecureConfig(user.id, account_id)
    },
    streamMode: ['updates', 'messages'],
    initialMessage: {
      type: 'metadata',
      data: { 
        success: true, 
        message: 'Interrupt handled, continuing execution...' 
      }
    },
    onError: (error) => {
      console.error('LangGraph continuation streaming error:', error);
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const thread_id = url.searchParams.get('thread_id');
    const run_id = url.searchParams.get('run_id');
    const responseParam = url.searchParams.get('response');
    
    // Extract account ID from query parameters
    const account_id = ConversationAuthService.extractAccountIdFromQuery(url, 'account_id');

    if (!thread_id || !run_id || !responseParam || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, run ID, response, and account ID are required' },
        { status: 400 }
      );
    }

    // Parse the response parameter
    let response;
    try {
      response = JSON.parse(responseParam);
    } catch (err) {
      return NextResponse.json(
        { error: 'Malformed response parameter: must be valid JSON.' },
        { status: 400 }
      );
    }

    return await handleInterruptLogic(thread_id, run_id, response, account_id, request);

  } catch (error: any) {
    console.error('Error handling interrupt (GET):', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, run_id, response } = body;

    // Extract account ID from request body
    const account_id = ConversationAuthService.extractAccountId(body, 'account_id');

    if (!thread_id || !run_id || response === undefined || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, run ID, response, and account ID are required' },
        { status: 400 }
      );
    }

    return await handleInterruptLogic(thread_id, run_id, response, account_id, request);

  } catch (error: any) {
    console.error('Error handling interrupt (POST):', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
} 