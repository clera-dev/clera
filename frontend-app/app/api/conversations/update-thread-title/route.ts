import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid or empty JSON body' },
        { status: 400 }
      );
    }
    throw err;
  }
  try {
    const { thread_id, title } = body;

    // Explicit type and length validation
    if (
      typeof thread_id !== 'string' ||
      thread_id.length < 1 ||
      thread_id.length > 128 ||
      typeof title !== 'string' ||
      title.length < 1 ||
      title.length > 256
    ) {
      return NextResponse.json(
        { error: 'Invalid thread_id or title: must be non-empty strings of reasonable length.' },
        { status: 400 }
      );
    }

    if (!thread_id || !title) {
      return NextResponse.json(
        { error: 'Thread ID and title are required' },
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

    // Update thread metadata with new title
    await langGraphClient.threads.update(thread_id, {
      metadata: {
        title: title
      }
    });
    // No logging of user input for security reasons
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating thread title:', error);
    
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