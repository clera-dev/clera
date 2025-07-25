import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id } = body;

    if (!thread_id) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      );
    }

    // Use centralized authentication service (user auth only, thread ownership validated separately)
    const authResult = await ConversationAuthService.authenticateUser(request);
    if (!authResult.success) {
      return authResult.error!;
    }

    const { user } = authResult;

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

    // Authorization check: ensure the thread belongs to the authenticated user
    const thread = await langGraphClient.threads.get(thread_id);
    if (!thread || !thread.metadata || thread.metadata.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete thread using LangGraph SDK
    await langGraphClient.threads.delete(thread_id);
    
    //console.log(`Deleted LangGraph thread.`);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting session:', error);
    
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