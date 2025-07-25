import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // SECURITY FIX: Removed 'config' from destructuring to prevent client-supplied config injection
    const { thread_id, input } = body;

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
      return authResult.error!;
    }

    const { user } = authResult.context!;

    // Create LangGraph client (server-side only)
    const langGraphClient = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY,
    });

    // SECURITY: Always construct config server-side using only authenticated values
    // Never trust client-supplied config to prevent privilege escalation attacks
    const runConfig = {
      configurable: { 
        user_id: user.id, // Always use authenticated user ID
        account_id: account_id // Use validated account ID from authorization check
      },
      stream_mode: 'messages-tuple' as const
    };

    console.log(`Submitting message to LangGraph thread ${thread_id} for account ${account_id}`);

    const run = await langGraphClient.runs.create(
      thread_id,
      process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
      {
        input: input,
        config: runConfig
      }
    );

    return NextResponse.json({ 
      success: true, 
      run_id: run.run_id,
      status: run.status
    });

  } catch (error: any) {
    console.error('Error submitting message:', error);
    
    // Handle specific LangGraph errors
    if (error.message?.includes('interrupt')) {
      return NextResponse.json(
        { 
          error: 'Interrupt required',
          interrupt: true,
          details: error.message 
        },
        { status: 202 } // Accepted but requires interaction
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 