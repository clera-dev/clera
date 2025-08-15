import { NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';
import { StreamDebugLogger } from './streamDebugLogger';

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
  // Persistence callbacks (optional - set by API routes)
  onRunStart?: (runId: string, threadId: string, userId: string, accountId: string) => Promise<void>;
  onToolStart?: (runId: string, toolKey: string, toolLabel: string, agent?: string) => Promise<void>;
  onToolComplete?: (runId: string, toolKey: string, status?: 'complete' | 'error') => Promise<void>;
  onRunFinalize?: (runId: string, status: 'complete' | 'error') => Promise<void>;
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
  private debugLogger: StreamDebugLogger | null = null;

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
    
    // Initialize debug logger if enabled
    // Initialize enhanced debug logger
    const enableDebug = process.env.LANGGRAPH_DEBUG_LOG === '1' || process.env.NODE_ENV === 'development';
    if (enableDebug) {
      try {
        this.debugLogger = new StreamDebugLogger({
          filePath: process.env.LANGGRAPH_DEBUG_LOG_FILE,
        });
      } catch (e) {
        // Fallback: Do not crash service if logger init fails
        console.error('[LangGraphStreamingService] Failed to initialize StreamDebugLogger:', e);
        this.debugLogger = null;
      }
    }
  }

  /**
   * Creates a streaming response for LangGraph operations
   * 
   * @param options Configuration options for the stream
   * @returns NextResponse with streaming content
   */
  async createStreamingResponse(options: LangGraphStreamingOptions & { runId?: string, userId?: string, accountId?: string, authToken?: string }): Promise<NextResponse> {
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
          
          // Send initial message if provided
          if (options.initialMessage) {
            const initialText = `data: ${JSON.stringify(options.initialMessage)}\n\n`;
            controller.enqueue(new TextEncoder().encode(initialText));
          }
          
          // Log session start with configured stream modes
          // try {
          //   serviceInstance.debugLogger?.logSessionStart(options.threadId, {
          //     streamMode: options.streamMode || ['updates', 'messages', 'messages-tuple']
          //   }, options.runId);
          // } catch {}

          // Start run persistence if callback provided (fire-and-forget)
          if (options.onRunStart && options.runId && options.userId && options.accountId) {
            try {
              const p = options.onRunStart(options.runId, options.threadId, options.userId, options.accountId);
              Promise.resolve(p).catch((err) => {
                console.error('[LangGraphStreamingService] Failed to persist run start:', err);
              });
            } catch (err) {
              console.error('[LangGraphStreamingService] Failed to invoke run start callback:', err);
            }
          }

          const langGraphStream = serviceInstance.langGraphClient.runs.stream(
            options.threadId,
            process.env.LANGGRAPH_ASSISTANT_ID || 'agent',
            {
              input: options.streamConfig.input,
              command: options.streamConfig.command,
              config: options.streamConfig.config,
              // Default to updates/messages and include messages-tuple for richer events when supported
              streamMode: options.streamMode as any || (['updates', 'messages', 'messages-tuple'] as any)
            }
          );

          // console.log('[LangGraphStreamingService] LangGraph stream created successfully');

          const eventCounts: Record<string, number> = {};
          const startedTools = new Set<string>(); // per-stream tool-start tracking

          for await (const chunk of langGraphStream) {
            // Debug log raw chunk metadata (sanitized)
            // try {
            //   serviceInstance.debugLogger?.logChunk(options.threadId, chunk, options.runId);
            // } catch (e) {}
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
            }

            // Additionally, attempt to derive tool/agent events for UI instrumentation
            try {
              let toolEvent = serviceInstance.tryBuildToolEvent(chunk);
              if (toolEvent) {
                const toolEventText = `data: ${JSON.stringify(toolEvent)}\n\n`;
                controller.enqueue(new TextEncoder().encode(toolEventText));
                // serviceInstance.debugLogger?.logDerivedEvent(options.threadId, toolEvent.type, toolEvent.data, options.runId);

                // Handle tool persistence if callbacks provided
                if (options.runId && toolEvent.type === 'tool_update') {
                  const toolName = (toolEvent.data?.toolName || '').toString();
                  const toolKey = toolName.replace(/\s+/g, '_').toLowerCase();
                  
                  if (toolEvent.data?.status === 'start' && options.onToolStart) {
                    try {
                      const p = options.onToolStart(
                        options.runId,
                        toolKey,
                        toolName,
                        (toolEvent as any)?.agent
                      );
                      Promise.resolve(p).catch((err) => {
                        console.error('[LangGraphStreamingService] Failed to persist tool start:', err);
                      });
                    } catch (err) {
                      console.error('[LangGraphStreamingService] Failed to invoke tool start callback:', err);
                    }
                  } else if (toolEvent.data?.status === 'complete' && options.onToolComplete) {
                    try {
                      const p = options.onToolComplete(options.runId, toolKey, 'complete');
                      Promise.resolve(p).catch((err) => {
                        console.error('[LangGraphStreamingService] Failed to persist tool complete:', err);
                      });
                    } catch (err) {
                      console.error('[LangGraphStreamingService] Failed to invoke tool complete callback:', err);
                    }
                  }
                }
              }

              // Heuristic: emit immediate tool start when updates list a tool name but no start emitted yet
              try {
                const evt = (chunk as any)?.event;
                const data = (chunk as any)?.data;
                if (evt === 'updates' && data && typeof data === 'object') {
                  const nodeName = Object.keys(data)[0];
                  const nodeData = data[nodeName];
                  const msgs = Array.isArray(nodeData?.messages) ? nodeData.messages : [];
                  for (const m of msgs) {
                    const raw = m?.name || m?.tool;
                    if (!raw) continue;
                    const name = serviceInstance.normalizeToolName(raw);
                    // Ignore transfers in tool start heuristic; handled as agent_transfer to drive blue bubble
                    if (typeof raw === 'string' && /^transfer_to_/i.test(raw)) {
                      const agent = raw.replace(/^transfer_to_/i, '');
                      const transferEvt = { type: 'agent_transfer', data: { toAgent: agent } };
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(transferEvt)}\n\n`));
                      // serviceInstance.debugLogger?.logDerivedEvent(options.threadId, 'agent_transfer', { toAgent: agent }, options.runId);
                      continue;
                    }
                    if (name === 'transfer_back_to_clera') continue;
                    const key = name.toLowerCase();
                    if (!startedTools.has(key)) {
                      startedTools.add(key);
                      const startEvt = { type: 'tool_update', data: { toolName: name, status: 'start' } };
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(startEvt)}\n\n`));
                      // serviceInstance.debugLogger?.logDerivedEvent(options.threadId, 'tool_update', { toolName: name, status: 'start' }, options.runId);
                      
                      // Handle heuristic tool start persistence
                      if (options.runId && options.onToolStart) {
                        try {
                          const p = options.onToolStart(
                            options.runId,
                            key.replace(/\s+/g, '_'),
                            name
                          );
                          Promise.resolve(p).catch((err) => {
                            console.error('[LangGraphStreamingService] Failed to persist heuristic tool start:', err);
                          });
                        } catch (err) {
                          console.error('[LangGraphStreamingService] Failed to invoke heuristic tool start callback:', err);
                        }
                      }
                    }
                  }
                }
              } catch {}
            } catch (e) {}

            // Count raw event types for session summary
            try {
              const evt = (chunk as any)?.event || 'unknown';
              eventCounts[evt] = (eventCounts[evt] || 0) + 1;
            } catch {}
          }

          // console.log('[LangGraphStreamingService] Stream completed successfully');
          controller.close();
          
          // Finalize run on successful completion (fire-and-forget)
          if (options.runId && options.onRunFinalize) {
            try {
              const p = options.onRunFinalize(options.runId, 'complete');
              Promise.resolve(p).catch((err) => {
                console.error('[LangGraphStreamingService] Failed to finalize run:', err);
              });
            } catch (err) {
              console.error('[LangGraphStreamingService] Failed to invoke run finalize callback:', err);
            }
          }
          
          // Log session end summary
          // try {
          //   serviceInstance.debugLogger?.logSessionEnd(options.threadId, { eventCounts });
          // } catch {}

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
          // try {
          //   serviceInstance.debugLogger?.logSessionEnd(options.threadId, { error: String(error) });
          // } catch {}
          
          // Finalize run on error (fire-and-forget)
          if (options.runId && options.onRunFinalize) {
            try {
              const p = options.onRunFinalize(options.runId, 'error');
              Promise.resolve(p).catch((err) => {
                console.error('[LangGraphStreamingService] Failed to finalize run on error:', err);
              });
            } catch (err) {
              console.error('[LangGraphStreamingService] Failed to invoke run finalize callback on error:', err);
            }
          }
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
   * Attempts to extract tool/agent events from raw LangGraph chunk
   * and convert them into UI-friendly events:
   * - tool_update: { toolName, status: 'start' | 'complete' }
   * - agent_transfer: { toAgent }
   */
  private tryBuildToolEvent(chunk: any): LangGraphChunk | null {
    const event = (chunk as any).event;
    const data = (chunk as any).data;

    // Detect transfers via tool messages or metadata
    try {
      if (event === 'updates' && data && typeof data === 'object') {
        const nodeName = Object.keys(data)[0];
        const nodeData = data[nodeName];

        // Heuristic: A tool node starting execution
        if (nodeName === 'tool_node' || (nodeData && (nodeData.type === 'tool' || nodeData.tool))) {
          const rawName = nodeData?.name || nodeData?.tool || 'tool';
          // Filter transfers: these should update status bubble, not render as tool boxes
          if (typeof rawName === 'string' && /^transfer_to_/i.test(rawName)) {
            const agent = rawName.replace(/^transfer_to_/i, '');
            return { type: 'agent_transfer', data: { toAgent: agent } };
          }
          const toolName = this.normalizeToolName(rawName);
          if (toolName === 'transfer_back_to_clera') {
            return null; // not a tool call for UI
          }
          return { type: 'tool_update', data: { toolName, status: 'start' } };
        }

        // Heuristic: Known agents appearing as node updates (transfer)
        const agentCandidates = ['financial_analyst_agent', 'portfolio_management_agent', 'trade_execution_agent', 'Clera'];
        if (agentCandidates.includes(nodeName)) {
          return { type: 'agent_transfer', data: { toAgent: nodeName } };
        }
      }

      // Detect completion via messages array containing tool completion markers
      if ((event === 'messages' || event === 'messages/complete') && Array.isArray(data)) {
        // Look for tool completion patterns
        for (const item of data) {
          if (item && typeof item === 'object') {
            // Pattern 1: tool message with success
            if (item.type === 'tool' && (item.status === 'success' || item.result === 'success')) {
              const raw = item.name || item.tool || 'tool';
              if (typeof raw === 'string' && /^transfer_to_/i.test(raw)) {
                const agent = raw.replace(/^transfer_to_/i, '');
                return { type: 'agent_transfer', data: { toAgent: agent } };
              }
              const toolName = this.normalizeToolName(raw);
              if (toolName === 'transfer_back_to_clera') {
                // Let this be handled as a regular tool completion
                // TimelineBuilder will add "Done" naturally when activities are complete
                return { type: 'tool_update', data: { toolName, status: 'complete' } };
              }
              return { type: 'tool_update', data: { toolName, status: 'complete' } };
            }
            // Pattern 2: content string containing transfer info
            if (typeof item.content === 'string') {
              const transferMatch = item.content.match(/Successfully transferred to\s+(\w+)/i);
              if (transferMatch) {
                return { type: 'agent_transfer', data: { toAgent: transferMatch[1] } };
              }
              const toolDoneMatch = item.content.match(/(completed|finished)\s+(\w+)/i);
              if (toolDoneMatch) {
                const toolName = this.normalizeToolName(toolDoneMatch[2]);
                if (toolName === 'transfer_back_to_clera') return null;
                return { type: 'tool_update', data: { toolName, status: 'complete' } };
              }
            }
          }
        }
      }
    } catch {
      // Silent fallback
    }

    return null;
  }

  private normalizeToolName(name: string): string {
    if (!name) return 'tool';
    // Return the raw tool key in lower snake case for consistent deduplication; mapping handled client-side
    return String(name).trim().toLowerCase();
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