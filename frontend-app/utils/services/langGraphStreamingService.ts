import { NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';

// Types for LangGraph streaming
export interface LangGraphChunk {
  type: string;
  data: any;
  interrupt?: any;
  streamMode?: string;
  nodeName?: string;
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
    const { threadId, streamConfig, streamMode, initialMessage, onError } = options;

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          // Send initial message if provided
          if (initialMessage) {
            const initialChunk = `data: ${JSON.stringify(initialMessage)}\n\n`;
            controller.enqueue(new TextEncoder().encode(initialChunk));
          }

          // Start LangGraph streaming
          const streamIterator = this.langGraphClient.runs.stream(
            threadId,
            process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            {
              input: streamConfig.input,
              command: streamConfig.command,
              config: streamConfig.config,
              streamMode: streamMode as any || ['updates', 'messages'] as any
            }
          );

          // Process stream chunks
          for await (const chunk of streamIterator) {
            const processedChunk = this.processStreamChunk(chunk);
            
            if (processedChunk) {
              // SECURITY: Never log sensitive user content or PII
              console.log('Sending processed chunk to client:', { type: processedChunk.type });
              
              const chunkText = `data: ${JSON.stringify(processedChunk)}\n\n`;
              controller.enqueue(new TextEncoder().encode(chunkText));
            }
          }

        } catch (error: any) {
          console.error('LangGraph streaming error:', error);
          
          // Call error handler if provided
          if (onError) {
            onError(error);
          }
          
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

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
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
    console.log('Processing LangGraph event:', event, 'with data keys:', Object.keys(data || {}));

    // Handle GraphInterrupt events
    if (event === '__interrupt__' || (data && data.__interrupt__)) {
      const interruptData = data.__interrupt__ || data;
      console.log('GraphInterrupt detected:', { hasInterrupt: true });
      
      return {
        type: 'interrupt',
        data: interruptData,
        interrupt: interruptData
      };
    }
    
    // Handle node execution updates for progress feedback
    if (event === 'updates' && data && typeof data === 'object') {
      const nodeName = Object.keys(data)[0];
      const nodeData = data[nodeName];
      
      return {
        type: 'node_update',
        data: nodeData,
        nodeName: nodeName,
        streamMode: 'updates'
      };
    }
    
    // Handle complete messages from LLM
    if (event === 'messages/complete' && Array.isArray(data)) {
      const hasMessages = data.some((item: any) => 
        item && typeof item === 'object' && (item.type || item.content || item.role)
      );
      
      if (hasMessages) {
        return { type: 'messages', data: data };
      } else {
        return { type: 'metadata', data: data };
      }
    }
    
    // Handle partial/streaming messages 
    if (event === 'messages/partial' && Array.isArray(data)) {
      return { type: 'message_token', data: data };
    }
    
    // Handle metadata events
    if (event === 'metadata' || event === 'messages/metadata') {
      return { type: 'metadata', data: data };
    }
    
    // Fallback for other events
    console.log('Unhandled event type:', event);
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