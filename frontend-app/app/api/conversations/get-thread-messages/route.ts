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
    } catch (threadError: any) {
      console.error(`[get-thread-messages] Error fetching thread ${thread_id}:`, threadError);
      // SECURITY: Return 403 Forbidden for all thread access errors to prevent resource enumeration
      // This includes both "thread not found" and "thread exists but not accessible" cases
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Strict authorization check: require proper thread ownership
    if (!thread) {
      console.error(`[get-thread-messages] Thread ${thread_id} not found`);
      // SECURITY: Return 403 Forbidden instead of 404 to prevent resource enumeration
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Require metadata and user_id to be present for security
    if (!thread.metadata || !thread.metadata.user_id) {
      console.error(`[get-thread-messages] Thread ${thread_id} missing required metadata or user_id`);
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Verify thread ownership
    if (thread.metadata.user_id !== user.id) {
      console.error(`[get-thread-messages] Thread ownership mismatch: thread user_id=${thread.metadata.user_id}, authenticated user_id=${user.id}`);
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
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
    // NOTE: Personalization context removal is no longer needed since personalization
    // is now handled via backend system prompts, not injected into user messages

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

        // BUG FIX: Extract citations from HTML comments for historical messages
        // Each message gets ONLY the citations embedded in its own content
        const citations: string[] = [];
        const htmlCommentPattern = /<!--\s*CITATIONS:\s*([^>]+)\s*-->/g;
        let match;
        while ((match = htmlCommentPattern.exec(content)) !== null) {
          if (match[1]) {
            const urls = match[1].split(',').map(url => url.trim()).filter(url => url);
            citations.push(...urls);
          }
        }

        // Remove duplicates while preserving order
        const uniqueCitations = Array.from(new Set(citations));

        // Remove HTML comment citations and XML tags from content
        content = content.replace(/<!--\s*CITATIONS:[\s\S]*?-->/g, '');
        content = content.replace(/<name>.*?<\/name>/g, '');
        content = content.replace(/<\/?content>/g, '');
        content = content.trim();

        const role = msg.type === 'human' ? 'user' : 'assistant';

        // Log citation extraction for debugging
        if (uniqueCitations.length > 0) {
          console.log(`[get-thread-messages] Extracted ${uniqueCitations.length} citations for message ${index}:`, uniqueCitations);
        }

        return {
          role,
          content,
          // Attach citations ONLY if found in this specific message (per-message isolation)
          ...(uniqueCitations.length > 0 && { citations: uniqueCitations })
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