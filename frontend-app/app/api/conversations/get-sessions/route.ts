import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Client } from '@langchain/langgraph-sdk';

// Limit constants to prevent resource exhaustion
const MIN_LIMIT = 1;
const MAX_LIMIT = 100; // Industry-standard for paginated APIs

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { portfolio_id } = body;
    let limit = body.limit ?? 20;

    // Clamp client-supplied limit to prevent resource exhaustion and abuse.
    // If the client requests more than MAX_LIMIT, only MAX_LIMIT will be returned.
    if (typeof limit !== 'number' || isNaN(limit)) {
      limit = 20;
    }
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, limit));

    if (!portfolio_id) {
      return NextResponse.json(
        { error: 'Portfolio ID is required' },
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

    // Verify user owns this portfolio/account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id || onboardingData.alpaca_account_id !== portfolio_id) {
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

    // Always use the authenticated user ID for downstream queries. Never trust user_id from the client.
    // This prevents privilege escalation and data leaks.
    const threads = await langGraphClient.threads.search({
      metadata: {
        user_id: user.id,
        account_id: portfolio_id
      },
      limit: limit
    });

    // Format threads as ChatSessions
    const sessions = threads.map(thread => {
      const metadata = thread.metadata || {};
      return {
        id: thread.thread_id,
        title: (metadata.title as string) || "New Conversation",
        createdAt: thread.created_at || new Date().toISOString(),
        updatedAt: thread.updated_at || new Date().toISOString(),
        messages: []
      };
    });
    
    console.log(`Found ${sessions.length} LangGraph sessions for portfolio: ${portfolio_id}`);
    
    return NextResponse.json({ sessions });
  } catch (error: any) {
    console.error('Error getting chat sessions:', error);
    
    if (error.message?.includes('Unauthorized') || error.message?.includes('Authentication')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 