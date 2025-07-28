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
      console.error('Authentication failed for user in get-thread-messages');
      return authResult.error!;
    }

    const { user } = authResult;
    //console.log(`[get-thread-messages] Authenticated user: ${user.id}, thread: ${thread_id}`);

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
    let thread;
    try {
      thread = await langGraphClient.threads.get(thread_id);
      console.log(`[get-thread-messages] Thread found:`, { 
        exists: !!thread, 
        hasMetadata: !!thread?.metadata,
        metadataUserId: thread?.metadata?.user_id,
        authenticatedUserId: user.id
      });
    } catch (threadError: any) {
      console.error(`[get-thread-messages] Error fetching thread ${thread_id}:`, threadError);
      // If thread doesn't exist, return empty messages instead of 403
      if (threadError.status === 404 || threadError.message?.includes('not found')) {
        console.log(`[get-thread-messages] Thread ${thread_id} not found, returning empty messages`);
        return NextResponse.json({ messages: [] });
      }
      throw threadError;
    }

    // Check thread ownership - be more lenient with missing metadata
    if (thread && thread.metadata && thread.metadata.user_id && thread.metadata.user_id !== user.id) {
      console.error(`[get-thread-messages] Thread ownership mismatch: thread user_id=${thread.metadata.user_id}, authenticated user_id=${user.id}`);
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // If thread exists but has no metadata or user_id, allow access but log it
    if (thread && (!thread.metadata || !thread.metadata.user_id)) {
      console.warn(`[get-thread-messages] Thread ${thread_id} has missing metadata or user_id, allowing access for user ${user.id}`);
    }

    // Get thread state to extract messages
    const threadState = await langGraphClient.threads.getState(thread_id);
    
    // Extract messages from thread state
    let messages: any[] = [];
    if (threadState.values && typeof threadState.values === 'object') {
      const stateValues = threadState.values as Record<string, unknown>;
      if (Array.isArray(stateValues.messages)) {
        messages = stateValues.messages;
      }
    }

    // Convert LangGraph messages to our frontend format
    const formattedMessages = messages
      .filter(msg => {
        // Filter out tool calls and internal messages
        if (msg.type === 'tool') return false;
        if (msg.name && msg.name !== 'Clera') return false;
        if (msg.tool_calls && msg.tool_calls.length > 0) return false;
        return true;
      })
      .map(msg => {
        let content = '';
        
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Handle array format: [{"text":"...", "type":"text", "index":0}]
          content = msg.content
            .map((item: any) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object') {
                // Extract text from different possible structures
                return item.text || item.content || JSON.stringify(item);
              }
              return String(item);
            })
            .join('');
        } else if (msg.content && typeof msg.content === 'object') {
          // Handle single object format: {"text":"...", "type":"text"}
          const contentObj = msg.content as any;
          content = contentObj.text || contentObj.content || JSON.stringify(contentObj);
        } else {
          content = String(msg.content || '');
        }

        return {
          role: msg.type === 'human' ? 'user' : 'assistant',
          content: content
        };
      });
    
    //console.log(`[get-thread-messages] Retrieved ${formattedMessages.length} messages for thread ${thread_id}`);
    
    return NextResponse.json({ messages: formattedMessages });
  } catch (error: any) {
    console.error('Error getting thread messages:', error);
    
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