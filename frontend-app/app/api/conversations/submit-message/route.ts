import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Client } from '@langchain/langgraph-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, user_id, account_id, config } = body;

    if (!thread_id || !input || !user_id || !account_id) {
      return NextResponse.json(
        { error: 'Thread ID, input, user ID, and account ID are required' },
        { status: 400 }
      );
    }

    // Create supabase server client for authentication
    const supabase = await createClient();
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user owns this account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id || onboardingData.alpaca_account_id !== account_id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Create LangGraph client (server-side only)
    const langGraphClient = new Client({
      apiUrl: process.env.LANGGRAPH_API_URL,
      apiKey: process.env.LANGGRAPH_API_KEY,
    });

    // Submit message to thread
    const runConfig = config || {
      configurable: { 
        user_id: user.id, // Use authenticated user ID only
        account_id: account_id 
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