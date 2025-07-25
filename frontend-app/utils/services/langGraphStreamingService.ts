import { NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';

// Types for LangGraph streaming
export interface LangGraphChunk {
  type: string;
  data: any;
  interrupt?: any;
  streamMode?: string;
  nodeName?: string;
  metadata?: any; // Add metadata property for enhanced event information
}

export interface StreamConfig {
  input: any;
  command?: { resume: any };
  config: {
    configurable: {
      user_id: string;
      account_id: string;
    };
  };
}

export interface LangGraphStreamingOptions {
  threadId: string;
  streamConfig: StreamConfig;
  streamMode?: any;
  initialMessage?: {
    type: string;
    data: any;
  };
  onError?: (error: Error) => void;
}

/**
 * LangGraph Streaming Service
 * 
 * Provides reusable streaming functionality for LangGraph conversations.
 * Handles chunk processing, error handling, and streaming response generation.
 * 
 * SECURITY: All config objects must be constructed server-side using authenticated values only.
 * This service assumes the caller has already validated authentication and authorization.
 */
export class LangGraphStreamingService {
  private langGraphClient: Client;

  constructor() {
    // Validate required environment variables
    const langGraphApiUrl = process.env.LANGGRAPH_API_URL;
    const langGraphApiKey = process.env.LANGGRAPH_API_KEY;
    
    if (!langGraphApiUrl || !langGraphApiKey) {
      throw new Error('Missing required LangGraph environment variables');
    }

    this.langGraphClient = new Client({
      apiUrl: langGraphApiUrl,
      apiKey: langGraphApiKey,
    });
  }

  /**
   * Creates a streaming response for LangGraph operations
   * 
   * @param options Configuration options for the stream
   * @returns NextResponse with streaming content
   */
  async createStreamingResponse(options: LangGraphStreamingOptions): Promise<NextResponse> {
    // console.log('[LangGraphStreamingService] Creating streaming response with options:', {
    //   threadId: options.threadId,
    //   streamMode: options.streamMode,
    //   hasInput: !!options.streamConfig.input,
    //   hasConfig: !!options.streamConfig.config
    // });

    // Capture service instance for use in ReadableStream
    const serviceInstance = this;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // console.log('[LangGraphStreamingService] Starting stream for thread:', options.threadId);
          
          const stream = await serviceInstance.langGraphClient.runs.stream(
            options.threadId,
            process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            {
              input: options.streamConfig.input,
              command: options.streamConfig.command,
              config: options.streamConfig.config,
              streamMode: options.streamMode as any || ['updates', 'messages'] as any
            }
          );

          // console.log('[LangGraphStreamingService] LangGraph stream created successfully');

          for await (const chunk of stream) {
            // console.log('[LangGraphStreamingService] Raw chunk received from LangGraph:', {
            //   hasChunk: !!chunk,
            //   chunkKeys: chunk ? Object.keys(chunk) : [],
            //   event: (chunk as any)?.event,
            //   dataType: typeof (chunk as any)?.data
            // });

            const processedChunk = serviceInstance.processStreamChunk(chunk);
            
            if (processedChunk) {
              // console.log('[LangGraphStreamingService] Sending processed chunk to client:', { 
              //   type: processedChunk.type,
              //   hasData: !!processedChunk.data,
              //   metadata: processedChunk.metadata
              // });
              
              const chunkText = `data: ${JSON.stringify(processedChunk)}\n\n`;
              controller.enqueue(new TextEncoder().encode(chunkText));
            } else {
              // console.log('[LangGraphStreamingService] Chunk processed but no output (filtered out)');
            }
          }

          // console.log('[LangGraphStreamingService] Stream completed successfully');
          controller.close();

        } catch (error: any) {
          console.error('[LangGraphStreamingService] Stream error:', error);
          options.onError?.(error);
          
          const errorChunk = {
            type: 'error',
            data: { error: 'An unexpected error occurred. Please try again later.' }
          };
          
          const errorText = `data: ${JSON.stringify(errorChunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorText));
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  /**
   * Processes individual stream chunks from LangGraph
   * 
   * @param chunk Raw chunk from LangGraph stream
   * @returns Processed chunk data or null if chunk should be ignored
   */
  private processStreamChunk(chunk: any): LangGraphChunk | null {
    const event = (chunk as any).event;
    const data = (chunk as any).data;

    // SECURITY: Only log non-sensitive metadata for debugging
    // console.log('[LangGraphStreamingService] Processing event:', event, 'with data keys:', Object.keys(data || {}));

    // UNIFIED EVENT HANDLING - Consistent with frontend expectations
    
    // 1. Handle GraphInterrupt events (highest priority)
    if (event === '__interrupt__' || (data && data.__interrupt__)) {
      const interruptData = data.__interrupt__ || data;
      // console.log('[LangGraphStreamingService] GraphInterrupt detected');
      
      return {
        type: 'interrupt',
        data: interruptData,
        interrupt: interruptData
      };
    }
    
    // 2. Handle node execution updates for status feedback
    if (event === 'updates' && data && typeof data === 'object') {
      const nodeName = Object.keys(data)[0];
      const nodeData = data[nodeName];
      
      // console.log('[LangGraphStreamingService] Node update:', nodeName);
      
      return {
        type: 'node_update',
        data: { nodeName, nodeData },
        nodeName: nodeName,
        streamMode: 'updates'
      };
    }
    
    // 3. Handle messages (final responses) - CRITICAL PATH FOR STATUS BUBBLE FIX
    if (event === 'messages' && Array.isArray(data)) {
      // console.log('[LangGraphStreamingService] Processing messages event with', data.length, 'items');
      
      // Filter for AI messages from Clera
      const aiMessages = data.filter((item: any) => 
        item && 
        typeof item === 'object' && 
        item.type === 'ai' && 
        item.name === 'Clera' &&
        item.content
      );
      
      if (aiMessages.length > 0) {
        // console.log('[LangGraphStreamingService] Found', aiMessages.length, 'AI messages from Clera');
        
        // CRITICAL FIX: Use 'messages_complete' type to trigger status message removal in frontend
        return { 
          type: 'messages_complete',
          data: aiMessages,
          metadata: { 
            event, 
            messageCount: aiMessages.length,
            isCompleteResponse: true
          }
        };
      } else {
        // console.log('[LangGraphStreamingService] No valid AI messages found in messages event');
        return { 
          type: 'messages_metadata',
          data: data,
          metadata: { event, messageCount: data.length }
        };
      }
    }
    
    // 4. Handle legacy message formats for backward compatibility
    if (event === 'messages/complete' && Array.isArray(data)) {
      // console.log('[LangGraphStreamingService] Processing legacy messages/complete event');
      
      const hasMessages = data.some((item: any) => 
        item && typeof item === 'object' && (item.type || item.content || item.role)
      );
      
      if (hasMessages) {
        // Convert to unified format
        return { 
          type: 'messages_complete',
          data: data,
          metadata: { event, isCompleteResponse: true }
        };
      } else {
        return { type: 'metadata', data: data };
      }
    }
    
    // 5. Handle token-level streaming (if LangGraph sends token events)
    if (event === 'messages/partial' && Array.isArray(data)) {
      // console.log('[LangGraphStreamingService] Processing partial messages for token streaming');
      return { type: 'message_token', data: data };
    }
    
    // 6. Handle messages-tuple streaming events (alternative token format)
    if (event.startsWith('messages-tuple/') && Array.isArray(data)) {
      // console.log('[LangGraphStreamingService] Processing messages-tuple event');
      return { type: 'message_token', data: data };
    }
    
    // 7. Handle metadata events
    if (event === 'metadata' || event === 'messages/metadata') {
      return { type: 'metadata', data: data };
    }
    
    // 8. Fallback for other events
    // console.log('[LangGraphStreamingService] Unhandled event type:', event);
    return { type: 'metadata', data: data };
  }

  /**
   * Creates an error streaming response
   * 
   * @param error Error to send to client
   * @param status HTTP status code
   * @returns NextResponse with error stream
   */
  static createErrorStreamingResponse(error: string, status: number = 500): NextResponse {
    const errorChunk = {
      type: 'error',
      data: { error }
    };
    
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
        controller.close();
      }
    });
    
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      status,
    });
  }

  /**
   * Factory method to create service instance with error handling
   * 
   * @returns LangGraphStreamingService instance or null if environment is invalid
   */
  static create(): LangGraphStreamingService | null {
    try {
      return new LangGraphStreamingService();
    } catch (error) {
      console.error('Failed to create LangGraphStreamingService:', error);
      return null;
    }
  }

  /**
   * Creates a secure config object for LangGraph operations
   * SECURITY: Always use authenticated user values only
   * 
   * @param userId Authenticated user ID
   * @param accountId Validated account ID
   * @param additionalConfig Optional additional configuration
   * @returns Secure config object
   */
  static createSecureConfig(
    userId: string, 
    accountId: string, 
    additionalConfig: Record<string, any> = {}
  ) {
    return {
      configurable: { 
        user_id: userId, // Always use authenticated user ID
        account_id: accountId, // Always use validated account ID
        ...additionalConfig
      }
    };
  }
} 