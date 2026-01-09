import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';
import { CitationStore } from '@/lib/server/CitationStore';

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

    // CITATIONS FIX: First, extract citations from tool messages and associate with subsequent assistant messages
    // This is necessary because tool messages (which contain citation HTML comments) are filtered out,
    // but we need to preserve the citations for display with the assistant's response

    // Helper function to extract content from message
    const extractContent = (msg: any): string => {
      if (typeof msg.content === 'string') {
        return msg.content;
      } else if (Array.isArray(msg.content)) {
        return msg.content
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return item.text || item.content || JSON.stringify(item);
            }
            return String(item);
          })
          .join('');
      } else if (msg.content && typeof msg.content === 'object') {
        const contentObj = msg.content as any;
        return contentObj.text || contentObj.content || JSON.stringify(contentObj);
      }
      return String(msg.content || '');
    };

    // Helper function to extract citations from HTML comments
    const extractCitationsFromContent = (content: string): string[] => {
      const citations: string[] = [];
      const htmlCommentPattern = /<!--\s*CITATIONS:\s*([^>]+)\s*-->/g;
      let match;
      while ((match = htmlCommentPattern.exec(content)) !== null) {
        if (match[1]) {
          const urls = match[1].split(',').map(url => url.trim()).filter(url => url);
          citations.push(...urls);
        }
      }
      return citations;
    };

    // Load persisted citations from database as fallback/supplement
    let persistedCitations = new Map<string, string[]>();
    try {
      persistedCitations = await CitationStore.getCitationsForThread({
        threadId: thread_id,
        userId: user.id
      });
      if (persistedCitations.size > 0) {
        console.log(`[get-thread-messages] Loaded ${persistedCitations.size} citation records from database`);
      }
    } catch (err) {
      console.error('[get-thread-messages] Failed to load persisted citations:', err);
    }

    // CRITICAL FIX: Extract citations and associate with the correct assistant messages
    // The key insight is that we need to match the filtering logic EXACTLY
    //
    // In the supervisor pattern, messages look like:
    //   human1 -> ai(Clera with tool_calls) -> tool -> ai(agent) -> tool(with citations) -> ai(agent) -> tool -> ai(Clera final)
    //
    // The filter keeps: human messages + Clera messages WITHOUT tool_calls
    // So we need to accumulate citations between each human message and the FINAL Clera response
    // (the one without tool_calls that will actually be displayed)

    // Helper function to check if a message will be kept after filtering
    const willBeKept = (msg: any): boolean => {
      if (msg.type === 'tool') return false;
      if (msg.name && msg.name !== 'Clera') return false;
      if (msg.tool_calls && msg.tool_calls.length > 0) return false;
      return true;
    };

    // Helper function to check if a message is a final Clera response (kept assistant message)
    const isFinalCleraResponse = (msg: any): boolean => {
      return msg.type === 'ai' &&
             msg.name === 'Clera' &&
             (!msg.tool_calls || msg.tool_calls.length === 0);
    };

    // Helper function to generate a tool message fingerprint (must match client algorithm)
    // This fingerprint is used to prevent duplicate citation extraction on the client
    const generateToolFingerprint = (msg: any, content: string): string => {
      // Use message ID or tool_call_id if available
      if (msg.id) return msg.id;
      if (msg.tool_call_id) return msg.tool_call_id;

      // Fallback to content-based fingerprint (matches secure-chat-client.ts algorithm)
      return `${msg.name || 'tool'}-${content.length}-${content.substring(0, 200)}`;
    };

    // First pass: Build a map of citations for each FINAL assistant message
    // We accumulate citations from all tool messages between the last human message
    // and the final Clera response
    // Also collect tool fingerprints for client-side pre-population
    const citationsByFinalResponse: string[][] = [];
    const toolFingerprints: string[] = []; // NEW: Collect fingerprints for all tool messages
    let currentCycleCitations: string[] = [];
    let lastHumanIndex = -1;

    console.log('[get-thread-messages] Processing', messages.length, 'messages for citation extraction');
    console.log('[get-thread-messages] Message structure:', messages.map((m: any, i: number) => ({
      index: i,
      type: m.type,
      name: m.name,
      hasToolCalls: !!(m.tool_calls && m.tool_calls.length > 0),
      willBeKept: willBeKept(m),
      isFinalResponse: isFinalCleraResponse(m)
    })));

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.type === 'human') {
        // Start of a new user request cycle - reset citations
        lastHumanIndex = i;
        currentCycleCitations = [];
        console.log(`[get-thread-messages] [${i}] Human message - starting new cycle`);
      } else if (msg.type === 'tool') {
        // Tool message - extract citations and add to current cycle
        const content = extractContent(msg);

        // NEW: Generate and store fingerprint for this tool message
        const fingerprint = generateToolFingerprint(msg, content);
        toolFingerprints.push(fingerprint);

        const citations = extractCitationsFromContent(content);
        if (citations.length > 0) {
          console.log(`[get-thread-messages] [${i}] Tool message with ${citations.length} citations:`, citations);
          currentCycleCitations.push(...citations);
        }
      } else if (isFinalCleraResponse(msg)) {
        // This is a FINAL Clera response (will be kept after filtering)
        // Save the accumulated citations for this response
        const uniqueCitations = Array.from(new Set(currentCycleCitations));
        citationsByFinalResponse.push(uniqueCitations);
        console.log(`[get-thread-messages] [${i}] Final Clera response - saving ${uniqueCitations.length} citations:`, uniqueCitations);
        // Don't reset currentCycleCitations here - there might be more tool calls after
        // Actually, reset it because we've committed these citations to this response
        currentCycleCitations = [];
      }
      // Note: We ignore intermediate AI messages (agents, Clera with tool_calls) for citation grouping
    }

    console.log(`[get-thread-messages] Citation extraction summary: ${citationsByFinalResponse.length} final responses with citations`);
    citationsByFinalResponse.forEach((citations, i) => {
      console.log(`[get-thread-messages]   Response ${i}: ${citations.length} citations`);
    });

    // Second pass: Filter messages and associate citations with assistant messages
    let assistantMessageIndex = 0;
    const formattedMessages = messages
      .filter(willBeKept)
      .map((msg, index) => {
        let content = extractContent(msg);
        const role = msg.type === 'human' ? 'user' : 'assistant';

        // For assistant messages, attach citations from the corresponding cycle
        let messageCitations: string[] = [];
        if (role === 'assistant') {
          // Get citations accumulated for this final response
          if (assistantMessageIndex < citationsByFinalResponse.length) {
            messageCitations = [...(citationsByFinalResponse[assistantMessageIndex] || [])];
            console.log(`[get-thread-messages] Mapping assistant message ${index} to citations index ${assistantMessageIndex}: ${messageCitations.length} citations`);
          }
          assistantMessageIndex++;

          // Also check for citations embedded directly in the assistant message content
          const contentCitations = extractCitationsFromContent(content);
          if (contentCitations.length > 0) {
            messageCitations.push(...contentCitations);
          }
        }

        // Remove duplicates while preserving order
        const uniqueCitations = Array.from(new Set(messageCitations));

        // Remove HTML comment citations and XML tags from content
        content = content.replace(/<!--\s*CITATIONS:[\s\S]*?-->/g, '');
        content = content.replace(/<name>.*?<\/name>/g, '');
        content = content.replace(/<\/?content>/g, '');
        content = content.trim();

        // Log citation extraction for debugging
        if (uniqueCitations.length > 0) {
          console.log(`[get-thread-messages] ✓ Attaching ${uniqueCitations.length} citations to ${role} message ${index}:`, uniqueCitations);
        }

        return {
          role,
          content,
          // Attach citations ONLY if found for this specific message (per-message isolation)
          ...(uniqueCitations.length > 0 && { citations: uniqueCitations })
        };
      });
    
    //console.log(`[get-thread-messages] Retrieved ${formattedMessages.length} messages for thread ${thread_id}`);

    console.log(`[get-thread-messages] Returning ${formattedMessages.length} messages with ${toolFingerprints.length} tool fingerprints`);

    // Return messages and tool fingerprints for client-side citation deduplication
    return NextResponse.json({
      messages: formattedMessages,
      toolFingerprints: toolFingerprints // NEW: Client uses these to pre-populate processedToolMessageIds
    });
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