import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { LangGraphStreamingService } from '@/utils/services/langGraphStreamingService';

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
  user_id: string
): Promise<NextResponse> {
  // Create supabase server client for authentication
  const supabase = await createClient();
  
  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    return LangGraphStreamingService.createErrorStreamingResponse('Unauthorized', 401);
  }

  // Verify user owns this account
  const { data: onboardingData, error: onboardingError } = await supabase
    .from('user_onboarding')
    .select('alpaca_account_id')
    .eq('user_id', user.id)
    .single();

  if (onboardingError || !onboardingData?.alpaca_account_id || onboardingData.alpaca_account_id !== account_id) {
    return LangGraphStreamingService.createErrorStreamingResponse('Forbidden', 403);
  }

  // Create streaming service instance
  const streamingService = LangGraphStreamingService.create();
  if (!streamingService) {
    return LangGraphStreamingService.createErrorStreamingResponse(
      'Server misconfiguration: LangGraph API credentials are missing.', 
      500
    );
  }

  // SECURITY: Never log sensitive user content or PII
  console.log(`Handling interrupt for thread ${thread_id}, run ${run_id}`);

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
    // Do not trust user_id from the query string; always use the authenticated user's ID
    const account_id = url.searchParams.get('account_id');

    if (!thread_id || !run_id || !responseParam || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, run ID, response, user ID, and account ID are required' },
        { status: 400 }
      );
    }

    // Parse the response parameter
    const response = JSON.parse(responseParam);

    return await handleInterruptLogic(thread_id, run_id, response, account_id, '');

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
    const { thread_id, run_id, response, account_id } = body;

    if (!thread_id || !run_id || response === undefined || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, run ID, response, and account ID are required' },
        { status: 400 }
      );
    }

    return await handleInterruptLogic(thread_id, run_id, response, account_id, '');

  } catch (error: any) {
    console.error('Error handling interrupt (POST):', error);
    return LangGraphStreamingService.createErrorStreamingResponse(
      error.message || 'Internal server error',
      500
    );
  }
} 