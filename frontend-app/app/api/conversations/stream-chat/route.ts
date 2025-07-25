import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { ConversationAuthService } from '@/utils/api/conversation-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, user_id } = body;

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

    // Create a streaming response with enhanced event handling
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use multiple streaming modes for enhanced user experience
          const streamConfig = {
            input: input,
            config: {
              configurable: { 
                user_id: user.id, // Use authenticated user ID only
                account_id: account_id 
              }
            },
            // PRODUCTION FIX: Use messages for token-by-token streaming (LangGraph standard)
            streamMode: ['updates', 'messages'] as any
          };

          const logConfig = JSON.stringify({
            thread_id,
            assistant_id: process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            streamMode: streamConfig.streamMode,
            user_id: user.id,
            account_id: account_id
          }, null, 2);
          
          console.log('[StreamChat] Starting stream.'); // hide logConfig for security
          
          const streamIterator = langGraphClient.runs.stream(
            thread_id,
            process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            streamConfig
          );

          for await (const chunk of streamIterator) {
            // SECURITY: Never log sensitive user content or PII. Logging full chunk data is prohibited.
            // Optionally, log only non-sensitive metadata for debugging:
            // console.log('Processing LangGraph event:', event, 'with data keys:', Object.keys(data || {}));
            
            let chunkData: {
              type: string;
              data: any;
              interrupt?: any;
              streamMode?: string;
              nodeName?: string;
            };

            // Handle actual LangGraph event format
            const event = (chunk as any).event;
            const data = (chunk as any).data;
            
            // DEBUG: Log event types to understand streaming
            console.log('[StreamChat] Received event:', event, 'data type:', typeof data, 'data keys:', Object.keys(data || {}));

            // Handle GraphInterrupt events
            if (event === '__interrupt__' || (data && data.__interrupt__)) {
              const interruptData = data.__interrupt__ || data;
              chunkData = {
                type: 'interrupt',
                data: interruptData,
                interrupt: interruptData
              };
            }
            // Handle node execution updates for progress feedback
            else if (event === 'updates' && data && typeof data === 'object') {
              const nodeName = Object.keys(data)[0];
              const nodeData = data[nodeName];
              
              chunkData = {
                type: 'node_update',
                data: nodeData,
                nodeName: nodeName,
                streamMode: 'updates'
              };
            }
            // Handle complete messages from LLM
            else if (event === 'messages/complete' && Array.isArray(data)) {
              const hasMessages = data.some((item: any) => 
                item && typeof item === 'object' && (item.type || item.content || item.role)
              );
              
              if (hasMessages) {
                chunkData = { type: 'messages', data: data };
              } else {
                chunkData = { type: 'metadata', data: data };
              }
            }
            // Handle partial/streaming messages (token-level streaming)
            else if (event === 'messages/partial' && Array.isArray(data)) {
              chunkData = { type: 'message_token', data: data };
            }
            // Handle raw messages events (fallback for when LangGraph sends 'messages' instead of 'messages/complete')
            else if (event === 'messages' && Array.isArray(data)) {
              console.log('[StreamChat] WARNING: Received raw "messages" event instead of messages-tuple. Data:', data);
              const hasMessages = data.some((item: any) => 
                item && typeof item === 'object' && (item.type || item.content || item.role)
              );
              
              if (hasMessages) {
                chunkData = { type: 'messages', data: data };
              } else {
                chunkData = { type: 'metadata', data: data };
              }
            }
            // Handle metadata events
            else if (event === 'metadata' || event === 'messages/metadata') {
              chunkData = { type: 'metadata', data: data };
            }
            // Fallback for other events
            else {
              console.log('Unhandled event type:', event);
              chunkData = { type: 'metadata', data: data };
            }

            // SECURITY: Never log sensitive user content or PII. Logging full chunk data is prohibited.
            // console.log('Sending chunk to client:', chunkData);

            // Send chunk to client
            const chunkText = `data: ${JSON.stringify(chunkData)}\n\n`;
            controller.enqueue(new TextEncoder().encode(chunkText));
          }

        } catch (error: any) {
          console.error('LangGraph streaming error:', error);
          const errorChunk = {
            type: 'error',
            data: { error: error.message }
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    // Return streaming response with proper headers
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Error in stream-chat API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 