import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Client } from '@langchain/langgraph-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, input, user_id, account_id } = body;

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

    console.log(`Starting LangGraph stream for thread ${thread_id} with account ${account_id}`);

    // Create a streaming response with enhanced event handling
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use multiple streaming modes for enhanced user experience
          const streamIterator = langGraphClient.runs.stream(
            thread_id,
            process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            {
              input: input,
              config: {
                configurable: { 
                  user_id: user_id, 
                  account_id: account_id 
                }
              },
              // Enhanced streaming with multiple modes for progressive updates
              streamMode: ['updates', 'messages']
            }
          );

          for await (const chunk of streamIterator) {
            console.log('Received LangGraph chunk:', { event: (chunk as any).event, data: (chunk as any).data });
            
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

            console.log('Processing LangGraph event:', event, 'with data keys:', Object.keys(data || {}));

            // Handle GraphInterrupt events
            if (event === '__interrupt__' || (data && data.__interrupt__)) {
              const interruptData = data.__interrupt__ || data;
              console.log('GraphInterrupt detected:', interruptData);
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
            // Handle partial/streaming messages 
            else if (event === 'messages/partial' && Array.isArray(data)) {
              chunkData = { type: 'message_token', data: data };
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

            console.log('Sending chunk to client:', chunkData);

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
      },
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