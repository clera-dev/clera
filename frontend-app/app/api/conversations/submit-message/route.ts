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

    // Validate required environment variables for LangGraph
    const langGraphApiUrl = process.env.LANGGRAPH_API_URL;
    const langGraphApiKey = process.env.LANGGRAPH_API_KEY;
    if (!langGraphApiUrl || !langGraphApiKey) {
      console.error('Missing required LangGraph environment variables:', {
        LANGGRAPH_API_URL: langGraphApiUrl,
        LANGGRAPH_API_KEY: langGraphApiKey ? '***set***' : undefined
      });
      return NextResponse.json(
        { error: 'Server misconfiguration: LangGraph API credentials are missing.' },
        { status: 500 }
      );
    }

    // Create LangGraph client (server-side only)
    const langGraphClient = new Client({
      apiUrl: langGraphApiUrl,
      apiKey: langGraphApiKey,
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

    console.log(`Submitting message.`);

    // CRITICAL FIX: Inject user context directly into the input since config isn't reaching prompt function
    const enrichedInput = {
      ...input,
      user_id: user.id,      // Add user_id to input
      account_id: account_id // Add account_id to input
    };

    const run = await langGraphClient.runs.create(
      thread_id,
      process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
      {
        input: enrichedInput,  // Use enriched input with user context
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