import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

// Limit constants to prevent resource exhaustion
const MIN_LIMIT = 1;
const MAX_LIMIT = 100; // Industry-standard for paginated APIs

export async function POST(request: NextRequest) {
  try {
    // Handle empty request body gracefully
    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error('JSON parse error in get-sessions:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { portfolio_id } = body;
    let limit = body.limit ?? 20;

    // Clamp client-supplied limit to prevent resource exhaustion and abuse.
    // If the client requests more than MAX_LIMIT, only MAX_LIMIT will be returned.
    if (typeof limit !== 'number' || isNaN(limit)) {
      limit = 20;
    }
    limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, limit));

    // Extract and validate account ID
    const accountId = ConversationAuthService.extractAccountId(body, 'portfolio_id');
    if (!accountId) {
      return NextResponse.json(
        { error: 'Portfolio ID is required' },
        { status: 400 }
      );
    }

    // Use centralized authentication and authorization service
    const authResult = await ConversationAuthService.authenticateAndAuthorize(request, accountId);
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

    // Always use the authenticated user ID for downstream queries. Never trust user_id from the client.
    // This prevents privilege escalation and data leaks.
    const threads = await langGraphClient.threads.search({
      metadata: {
        user_id: user.id,
        account_id: accountId
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