import { Message } from './chat-client';
import { ToolActivity } from '@/types/chat';
import { ToolActivityManager } from '@/utils/services/ToolActivityManager';

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  interrupt: {
    value: string;
    runId: string;
    resumable: boolean;
    ns?: string[];
  } | null;
  modelProviderError: boolean; // NEW: Flag for graceful model provider error handling
  toolActivities: ToolActivity[]; // NEW: Track tool start/complete lifecycle
}

export interface SecureChatClient {
  readonly state: ChatState;
  handleInterrupt: (threadId: string, runId: string, response: any) => Promise<void>;
  startStream: (threadId: string, input: any, userId: string, accountId: string) => Promise<void>;
  clearError: () => void;
  clearErrorOnChatLoad: () => void; // PRODUCTION FIX: Clear errors when loading existing chat
  clearModelProviderError: () => void;
  setMessages: (messages: Message[]) => void;
  addMessagesWithStatus: (userMessage: Message) => void;
  mergePersistedToolActivities: (activities: ToolActivity[]) => void;
  fetchAndHydrateToolActivities: (threadId: string, accountId: string) => Promise<string[]>;
  subscribe: (listener: () => void) => () => void;
  setLongProcessingCallback: (callback: () => void) => void; // ARCHITECTURE FIX: Proper separation of concerns
  clearLongProcessingCallback: () => void; // MEMORY LEAK FIX: Clear callback on unmount
  setQuerySuccessCallback: (callback: (userId: string) => Promise<void>) => void; // NEW: Query success recording
  cleanup: () => void;
}

// ToolActivity is defined centrally in '@/types/chat'.

export class SecureChatClientImpl implements SecureChatClient {
  private _state: ChatState = {
    messages: [],
    isLoading: false,
    error: null,
    interrupt: null,
    modelProviderError: false,
    toolActivities: [],
  };
  
  private stateListeners: Set<() => void> = new Set();
  private eventSource: EventSource | null = null;
  private isStreaming: boolean = false;
  private hasReceivedRealContent: boolean = false;
  private toolActivityManager: ToolActivityManager;
  private hasReceivedInterrupt: boolean = false;
  private streamCompletedSuccessfully: boolean = false; // NEW: Track if chunk processing handled completion
  private longProcessingTimer: NodeJS.Timeout | null = null; // Track long processing timer
  private gracePeriodTimer: NodeJS.Timeout | null = null; // MEMORY LEAK FIX: Track grace period timer
  private longProcessingCallback: (() => void) | null = null; // ARCHITECTURE FIX: Callback for UI layer
  private querySuccessCallback: ((userId: string) => Promise<void>) | null = null; // NEW: Query success callback
  private lastThreadId: string | null = null; // Track thread for toolActivities lifecycle
  private currentQueryRunId: string | null = null; // Track current user query for tool grouping
  

  constructor() {
    this.toolActivityManager = new ToolActivityManager();
    
    // Set up the callback to sync tool activities to state
    this.toolActivityManager.setStateUpdateCallback((activities: ToolActivity[]) => {
      this.setState({ toolActivities: activities });
    });
  }

  /**
   * Returns an immutable copy of the current state
   * Prevents external mutation and maintains encapsulation
   */
  get state(): ChatState {
    return {
      messages: [...this._state.messages], // Shallow copy of messages array
      isLoading: this._state.isLoading,
      error: this._state.error,
      interrupt: this._state.interrupt ? { ...this._state.interrupt } : null, // Deep copy of interrupt object
      modelProviderError: this._state.modelProviderError,
      toolActivities: [...this._state.toolActivities],
    };
  }

  private setState(newState: Partial<ChatState>) {
    this._state = { ...this._state, ...newState };
    this.stateListeners.forEach(listener => listener());
  }

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  clearError() {
    this.setState({ error: null });
  }

  // PRODUCTION FIX: Method to clear errors when user navigates back to existing chat
  clearErrorOnChatLoad() {
    // Clear any persistent errors when loading an existing chat conversation
    if (this._state.error) {
      // console.log('[SecureChatClient] Clearing error on chat load for better UX');
      this.setState({ error: null });
    }
  }

  setMessages(messages: Message[]) {
    // CRITICAL FIX: Validate all messages to prevent backend errors
    const validMessages = messages.filter(msg => {
      const isValid = msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
      if (!isValid) {
        console.error('[SecureChatClient] Filtering out invalid message.');
      }
      return isValid;
    });

    // console.log('[SecureChatClient] setMessages called - Original:', messages.length, 'Valid:', validMessages.length);
    
    this.setState({ messages: [...validMessages] }); // Create defensive copy
  }

  // Safely merge server-persisted tool activities into client state
  // Only appends activities for runs not already present, to avoid duplicating current in-memory runs
  mergePersistedToolActivities(activities: ToolActivity[]) {
    this.toolActivityManager.mergePersistedActivities(activities);
  }

  // Fetch persisted tool activities for a thread and merge into state. Returns sorted runIds.
  async fetchAndHydrateToolActivities(threadId: string, accountId: string): Promise<string[]> {
    return this.toolActivityManager.fetchAndHydrateToolActivities(threadId, accountId);
  }

  private addToolStart(toolName: string) {
    this.toolActivityManager.setCurrentRunId(this.currentQueryRunId);
    this.toolActivityManager.addToolStart(toolName);
  }

  private markToolComplete(toolName: string) {
    this.toolActivityManager.setCurrentRunId(this.currentQueryRunId);
    this.toolActivityManager.markToolComplete(toolName);
  }

  private completeAllRunningForCurrentRun() {
    this.toolActivityManager.setCurrentRunId(this.currentQueryRunId);
    this.toolActivityManager.completeAllRunningForCurrentRun();
  }

  // Explicit run completion marker so TimelineBuilder can add "Done" only at the right time
  private markRunCompleted(): void {
    this.toolActivityManager.setCurrentRunId(this.currentQueryRunId);
    this.toolActivityManager.markRunCompleted();
  }

  // Removed addCompletionMarker - TimelineBuilder now handles "Done" naturally

  // Helper to ensure a runId is generated before we attach messages/activities
  private ensureCurrentRunId(): string {
    if (this.currentQueryRunId) return this.currentQueryRunId;
    const uuid = this.generateRunId();
    this.currentQueryRunId = uuid;
    return uuid;
  }

  // Centralized UUIDv4 generator for client use
  private generateRunId(): string {
    try {
      const g: any = globalThis as any;
      if (g?.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
      }
      if (g?.crypto && typeof g.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        g.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xxxxxx
        const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
      }
    } catch {}
    // Final fallback (non-crypto): maintain format to avoid UI/DB surprises
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  addMessagesWithStatus(userMessage: Message) {
    // CRITICAL FIX: Validate message content to prevent backend errors
    if (!userMessage.content || userMessage.content.trim() === '') {
      console.error('[SecureChatClient] Attempted to add empty user message, rejecting.');
      return;
    }

    // Ensure we have a runId BEFORE constructing messages
    const runIdForMsg = this.ensureCurrentRunId();

    // Add both user message and status message atomically to prevent timing issues
    const statusMessage: Message = {
      role: 'assistant',
      content: 'Analyzing your request...',
      isStatus: true,
      runId: runIdForMsg,
    };

    // Ensure we preserve all existing messages and add the new ones atomically
    const newMessages = [...this._state.messages, { ...userMessage, runId: runIdForMsg }, statusMessage];

    this.setState({ messages: newMessages });

    // Immediately add "Thinking" step so the timeline appears right away
    this.addToolStart('Thinking');
  }

  /**
   * Handles GraphInterrupt events from LangGraph agents
   */
  async handleInterrupt(threadId: string, runId: string, response: any): Promise<void> {
    // Store current interrupt for potential restoration on error
    const currentInterrupt = this._state.interrupt;
    
    try {
      // Optimistically clear interrupt and show processing state
      this.setState({ 
        isLoading: true, 
        error: null, 
        interrupt: null 
      });
      
      // Reset content flag for interrupt continuation
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false; // Reset interrupt tracking for new stream
      this.streamCompletedSuccessfully = false; // Reset completion tracking for new stream
      this.isStreaming = true; // Ensure streaming flag is set for token aggregation
      
      // CRITICAL FIX: Import and use getAlpacaAccountId utility for consistency
      const { getAlpacaAccountId } = await import('@/lib/utils');
      const { createClient } = await import('@/utils/supabase/client');
      
      // Get authenticated user and account ID using the same method as Chat page
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('User not authenticated');
      }
      
      const accountId = await getAlpacaAccountId();
      
      if (!user.id || !accountId) {
        throw new Error('User ID or Account ID not found - authentication required');
      }

      // console.log('[SecureChatClient] Handling interrupt with authenticated user and account');

      // Close existing stream before starting interrupt handling
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      // Use fetch + ReadableStream for SSE, sending authenticated data in POST body
      const responseStream = await fetch('/api/conversations/handle-interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          run_id: runId,
          response,
          user_id: user.id,
          account_id: accountId, // Now using the correct account ID
        }),
      });

      if (!responseStream.ok) {
        const errorText = await responseStream.text();
        console.error('[SecureChatClient] Interrupt response error:', {
          status: responseStream.status,
          statusText: responseStream.statusText,
          errorText
        });
        throw new Error(`Failed to handle interrupt: ${responseStream.status} ${errorText}`);
      }

      if (!responseStream.body) throw new Error('No response body for SSE stream');

      const reader = responseStream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                this.handleStreamChunk(data, { userId: user.id });
              } catch (err) {
                console.error('[SecureChatClient] Error parsing SSE chunk:', err);
              }
            }
          }
        }
      }
      // console.log('[SecureChatClient] Interrupt handled successfully');
      this.setState({ isLoading: false });
      this.isStreaming = false; // Unset streaming flag when done
    } catch (error: any) {
      // console.error('[SecureChatClient] Error handling interrupt:', error);
      
      // MEMORY LEAK FIX: Clear timers and reset flags on error
      if (this.longProcessingTimer) {
        clearTimeout(this.longProcessingTimer);
        this.longProcessingTimer = null;
      }
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false;
      this.streamCompletedSuccessfully = false;
      
      this.setState({ 
        error: error.message || 'Failed to handle interrupt',
        isLoading: false,
        interrupt: currentInterrupt // Restore interrupt on error
      });
      this.isStreaming = false; // Unset streaming flag on error
    }
  }

  async startStream(threadId: string, input: any, userId: string, accountId: string): Promise<void> {
    // Create immutable per-stream context to avoid relying on mutable instance state
    const streamContext = { userId };
    // PRODUCTION FIX: Declare timeout variables outside try block for proper scoping
    let timeoutId: NodeJS.Timeout | undefined;
    let abortController: AbortController | undefined;
    
    try {
      // console.log('[SecureChatClient] Starting stream for thread:', threadId, 'with input:', typeof input);
      
      // CRITICAL FIX: Reset streaming state at the beginning of each stream
      // This ensures status messages don't persist from previous streams
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false; // Reset interrupt tracking
      this.streamCompletedSuccessfully = false; // Reset completion tracking
      this.isStreaming = true;
      
      // MEMORY LEAK FIX: Clear any existing grace period timer from previous stream
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      
      this.setState({ isLoading: true, error: null });
      
      // Status message is now added by the caller before startStream is called
      // This prevents timing issues with React batching

      // Don't clear tool activities here - they are isolated by runId
      // The UI will only show activities for the current query's runId
      this.lastThreadId = threadId;

      // New user query starts: tag new run id and ensure clean state
      if (!this.currentQueryRunId) {
        const uuid = this.generateRunId();
        this.currentQueryRunId = uuid;
        
        // CRITICAL FIX: When starting a new query, remove any orphaned activities 
        // that might have been created without proper runIds
        // This prevents cross-contamination between queries in the same thread
        const cleanActivities = this._state.toolActivities.filter((a: any) => 
          a.runId && a.runId !== 'unknown' && a.runId !== this.currentQueryRunId
        );
        this.setState({ toolActivities: cleanActivities });
      }

      const runId = this.currentQueryRunId!;

      // Close existing stream if any
      if (this.eventSource) {
        // console.log('[SecureChatClient] Closing existing stream');
        this.eventSource.close();
      }

      // console.log('[SecureChatClient] Making stream request to /api/conversations/stream-chat');

      // PRODUCTION FIX: Add AbortController for proper timeout handling (120 seconds as requested)
      abortController = new AbortController();
      timeoutId = setTimeout(() => {
        // console.log('[SecureChatClient] Stream timeout reached (120 seconds), aborting request');
        abortController?.abort();
      }, 120000); // 120 seconds timeout

      // Start new stream with timeout control
      const response = await fetch('/api/conversations/stream-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: threadId,
          input: input,
          user_id: userId,
          account_id: accountId,
          run_id: runId,
        }),
        signal: abortController?.signal,
      });

      // console.log('[SecureChatClient] Stream response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SecureChatClient] Stream response error:`, {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        
        // Try to parse as JSON for structured error, fallback to text
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: ${errorText}`);
      }

      // console.log('[SecureChatClient] Stream response received, starting to read chunks...');

      // ARCHITECTURE FIX: Set up long processing detection - notify UI layer via callback
      this.longProcessingTimer = setTimeout(() => {
        // If still processing after 30 seconds, notify UI layer (don't create messages directly)
        if (this.isStreaming && !this.hasReceivedRealContent && !this.hasReceivedInterrupt) {
          // console.log('[SecureChatClient] Long processing detected, notifying UI layer');
          this.longProcessingCallback?.(); // Let UI layer handle the presentation
        }
      }, 30000); // Notify after 30 seconds of processing

      // Create EventSource from the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      // console.log('[SecureChatClient] Starting to read stream chunks...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // console.log('[SecureChatClient] Stream reading completed, total chunks processed:', chunkCount);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // console.log('[SecureChatClient] Received', lines.length, 'lines in this read');

        for (const line of lines) {
          // console.log('[SecureChatClient] Processing line:', line.substring(0, 100) + (line.length > 100 ? '...' : ''));
          
          if (line.startsWith('data: ')) {
            chunkCount++;
            try {
              const data = JSON.parse(line.slice(6));
              // console.log(`[SecureChatClient] Processing chunk ${chunkCount}:`, { 
              //   type: data.type, 
              //   hasData: !!data.data,
              //   dataType: typeof data.data,
              //   dataKeys: data.data ? Object.keys(data.data) : []
              // });
              
              // CRITICAL FIX: Actually call handleStreamChunk to process the chunk!
              this.handleStreamChunk(data, streamContext);
            } catch (e) {
              console.error('[SecureChatClient] Error parsing stream chunk:', e, 'Line:', line);
            }
          } else if (line.trim() !== '') {
            // console.log('[SecureChatClient] Non-data line:', line);
          }
        }
      }

      // Stream completed - reset runId so next user query starts fresh
      // This also triggers automatic timeline collapse in Chat.tsx
      this.currentQueryRunId = null;

      // console.log('[SecureChatClient] Stream completed successfully, final state:', {
      //   hasReceivedRealContent: this.hasReceivedRealContent,
      //   hasReceivedInterrupt: this.hasReceivedInterrupt,
      //   streamCompletedSuccessfully: this.streamCompletedSuccessfully,
      //   messageCount: this._state.messages.length,
      //   totalChunksProcessed: chunkCount
      // });
      
      // MEMORY LEAK FIX: Clear all timeouts since stream completed
      if (timeoutId) clearTimeout(timeoutId);
      if (this.longProcessingTimer) {
        clearTimeout(this.longProcessingTimer);
        this.longProcessingTimer = null;
      }
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      
      // CRITICAL FIX: Only run completion logic if chunk processing didn't handle it
      // This prevents race conditions and state corruption from redundant setState calls
      if (!this.streamCompletedSuccessfully) {
        // Fallback completion logic only for edge cases where chunk processing failed
        const hasValidResponse = this.hasReceivedRealContent || this.hasReceivedInterrupt;
        
        // console.log('[SecureChatClient] Completion logic - streamCompletedSuccessfully:', this.streamCompletedSuccessfully, 
        //            'hasReceivedRealContent:', this.hasReceivedRealContent, 
        //            'hasReceivedInterrupt:', this.hasReceivedInterrupt,
        //            'chunkCount:', chunkCount,
        //            'currentMessages:', this._state.messages.length);
        
        if (hasValidResponse) {
          this.setState({ isLoading: false });
          
          // CRITICAL SECURITY FIX: Record query for token streaming responses
          // This prevents bypass of daily query limits when responses come via message_token
          if (this.querySuccessCallback && streamContext.userId) {
            try {
              this.querySuccessCallback(streamContext.userId).catch(error => {
                console.error('[SecureChatClient] Error recording query success (fallback):', error);
                // Don't throw - this shouldn't break the chat flow
              });
            } catch (error) {
              console.error('[SecureChatClient] Error calling querySuccessCallback (fallback):', error);
            }
          }
          
          // console.log('[SecureChatClient] FALLBACK completion - valid response detected and query recorded');
        } else {
          // PRODUCTION FIX: More graceful handling when stream completed without content
          // This commonly happens when agent is still processing - response may arrive later via DB sync
          // console.warn('[SecureChatClient] Stream completed without immediate response - agent may still be processing');
          
          // Clean up status messages but don't show harsh error immediately
          const cleanMessages = this._state.messages.filter(msg => !msg.isStatus);
          
          // PRODUCTION FIX: Keep loading state during grace period to allow proper error checking
          this.setState({ 
            messages: cleanMessages,
            isLoading: true // Keep loading during grace period
          });
          
          // MEMORY LEAK FIX: Store timeout for proper cleanup
          this.gracePeriodTimer = setTimeout(() => {
            // Only show error if we still haven't received content after additional wait
            if (!this.hasReceivedRealContent && !this.hasReceivedInterrupt) {
              // console.error('[SecureChatClient] No response after extended wait - showing retry message');
              this.setState({ 
                messages: cleanMessages,
                error: 'No response received from agent. Please try again.',
                isLoading: false 
              });
            }
            this.gracePeriodTimer = null; // Clear reference after execution
          }, 3000); // Wait additional 3 seconds before showing error
        }
      } else {
        // console.log('[SecureChatClient] Chunk processing handled completion successfully - skipping redundant completion logic');
      }
      // If streamCompletedSuccessfully is true, chunk processing already handled completion correctly
      
      this.isStreaming = false;

    } catch (error: any) {
      // MEMORY LEAK FIX: Clear all timeouts on error
      if (timeoutId) clearTimeout(timeoutId);
      if (this.longProcessingTimer) {
        clearTimeout(this.longProcessingTimer);
        this.longProcessingTimer = null;
      }
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      
      // console.error('[SecureChatClient] Error starting stream:', error);
      
      // PRODUCTION FIX: Handle timeout errors more gracefully
      let errorMessage = error.message || 'Failed to start stream';
      if (error.name === 'AbortError') {
        // console.warn('[SecureChatClient] Stream was aborted due to timeout (120 seconds)');
        errorMessage = 'Request timed out. The agent may still be processing your request. Please try again or refresh the page.';
      }
      
      // CRITICAL FIX: Reset streaming flags on error to prevent stuck states
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false; // Reset interrupt tracking on error
      this.streamCompletedSuccessfully = false; // Reset completion tracking on error
      this.isStreaming = false;
      
      this.setState({ 
        error: errorMessage,
        isLoading: false 
      });
    }
  }

  private handleStreamChunk(chunk: any, context?: { userId: string }) {
    // console.log('[SecureChatClient] handleStreamChunk called with:', {
    //   type: chunk.type,
    //   hasData: !!chunk.data,
    //   dataType: typeof chunk.data,
    //   dataLength: Array.isArray(chunk.data) ? chunk.data.length : 'not array',
    //   currentState: {
    //     isStreaming: this.isStreaming,
    //     hasReceivedRealContent: this.hasReceivedRealContent,
    //     hasReceivedInterrupt: this.hasReceivedInterrupt,
    //     streamCompletedSuccessfully: this.streamCompletedSuccessfully,
    //     messageCount: this._state.messages.length,
    //     isLoading: this._state.isLoading
    //   }
    // });
    
    // Handle different chunk types with simplified, standardized logic
    
    // 1. Handle errors immediately
    if (chunk.type === 'error') {
      console.error('[SecureChatClient] Stream error chunk:', chunk);
      this.setState({ 
        error: chunk.data?.error || 'Stream error',
        isLoading: false 
      });
      return;
    }

    // 2. Handle GraphInterrupt events
    if (chunk.type === 'interrupt') {
      // console.log('[SecureChatClient] Processing GraphInterrupt:', {
      //   hasData: !!chunk.data,
      //   dataType: typeof chunk.data,
      //   isArray: Array.isArray(chunk.data)
      // });
      
      let interruptData = chunk.data;
      
      // Handle array format (if multiple interrupts)
      if (Array.isArray(chunk.data) && chunk.data.length > 0) {
        interruptData = chunk.data[0];
      }
      
      // Extract interrupt information based on LangGraph format
      const value = interruptData?.value || interruptData || 'Confirmation required';
      const resumable = interruptData?.resumable !== false; // default to true
      const ns = interruptData?.ns || [];
      
      // CRITICAL FIX: Mark interrupt as a valid response (not an error)
      this.hasReceivedInterrupt = true;
      this.streamCompletedSuccessfully = true; // Mark that chunk processing handled completion
      
      // MEMORY LEAK FIX: Clear all timers since we got a valid interrupt
      if (this.longProcessingTimer) {
        clearTimeout(this.longProcessingTimer);
        this.longProcessingTimer = null;
      }
      if (this.gracePeriodTimer) {
        clearTimeout(this.gracePeriodTimer);
        this.gracePeriodTimer = null;
      }
      
      // NEW: Record successful query completion for limit tracking (interrupts are valid responses)
      if (this.querySuccessCallback && context?.userId) {
        try {
          this.querySuccessCallback(context.userId).catch(error => {
            console.error('[SecureChatClient] Error recording query success (interrupt):', error);
            // Don't throw - this shouldn't break the chat flow
          });
        } catch (error) {
          console.error('[SecureChatClient] Error calling querySuccessCallback (interrupt):', error);
        }
      }
      
      // console.log('[SecureChatClient] Marked interrupt as valid response - completed by chunk processing');
      
      this.setState({
        interrupt: {
          value: typeof value === 'string' ? value : JSON.stringify(value),
          runId: 'current', // We'll use the current stream
          resumable,
          ns
        },
        isLoading: false
      });
      return;
    }

    // 3. Handle node execution updates for progressive feedback
    if (chunk.type === 'node_update' && chunk.data?.nodeName) {
      const nodeName = chunk.data.nodeName;
      // console.log(`[SecureChatClient] Node update for: ${nodeName}, hasReceivedRealContent: ${this.hasReceivedRealContent}`);
      
      // CRITICAL FIX: Only show status messages if we haven't received real content yet
      // This prevents status messages from overriding completed responses
      if (!this.hasReceivedRealContent) {
        // console.log('[SecureChatClient] Updating status for node:', nodeName);
        
        const statusMessage: Message = {
          role: 'assistant',
          content: this.getNodeStatusMessage(nodeName),
          isStatus: true
        };
        
        // Remove any existing status messages and add the new one atomically
        const messages = this._state.messages.filter(msg => !msg.isStatus);
        this.setState({ messages: [...messages, statusMessage] });
      } else {
        // console.log('[SecureChatClient] Skipping node status update - real content already received');
      }
      // Heuristic: treat certain node updates as tool starts
      if (nodeName === 'tool_node') {
        const toolName = chunk.data?.nodeData?.name || chunk.data?.nodeData?.tool || 'tool';
        this.addToolStart(toolName);
      }
      return;
    }

    // 4. Handle complete messages from agents - CRITICAL PATH FOR BUG FIX
    if (chunk.type === 'messages_complete' && chunk.data && Array.isArray(chunk.data)) {
      // console.log('[SecureChatClient] Processing messages_complete chunk:', {
      //   messageCount: chunk.data.length,
      //   isCompleteResponse: chunk.metadata?.isCompleteResponse,
      //   firstMessage: chunk.data[0],
      //   allMessageTypes: chunk.data.map((msg: any) => ({ type: msg?.type, name: msg?.name, hasContent: !!msg?.content }))
      // });
      
      // Process all AI messages from Clera
      const newMessages: Message[] = [];
      let hasValidContent = false;
      
      for (const messageData of chunk.data) {
        // console.log('[SecureChatClient] Processing message data:', {
        //   type: messageData?.type,
        //   name: messageData?.name,
        //   hasContent: !!messageData?.content,
        //   contentType: typeof messageData?.content,
        //   contentLength: Array.isArray(messageData?.content) ? messageData.content.length : (messageData?.content?.length || 0),
        //   content: messageData?.content
        // });
        
        if (messageData && messageData.type === 'ai' && messageData.name === 'Clera') {
          // Extract content from AI message
          let content = '';
          if (typeof messageData.content === 'string') {
            content = messageData.content;
          } else if (Array.isArray(messageData.content) && messageData.content.length > 0) {
            content = messageData.content.map((item: any) => 
              typeof item === 'string' ? item : (item.text || JSON.stringify(item))
            ).join('');
          }

          // console.log('[SecureChatClient] Processing AI message with content length:', content.length);

          if (content && content.trim().length > 0) {
            hasValidContent = true;
            
            // Create new message with safe ID assignment and runId for timeline association
            const newMessage: Message = { 
              role: 'assistant', 
              content: content.trim(),
              runId: this.currentQueryRunId || undefined,
              ...(messageData.id !== undefined && { id: messageData.id })
            };
            
            newMessages.push(newMessage);
          } else if (messageData.name === 'Clera' && 
                     (!messageData.content || 
                      (typeof messageData.content === 'string' && messageData.content.trim() === '') ||
                      (Array.isArray(messageData.content) && messageData.content.length === 0))) {
            // CRITICAL FIX: Detect truly empty Clera responses (Anthropic model provider issue)
            // Only trigger for messages that have no content at all, not for valid non-textual content
            //console.log('[SecureChatClient] Detected empty Clera response - setting graceful model provider error');
            
            // CRITICAL FIX: Remove status messages when setting model provider error
            // This ensures the "Analyzing your request..." message disappears
            const cleanMessages = this._state.messages.filter(msg => !msg.isStatus);
            
            // Set graceful error state and mark as handled to prevent harsh error message
            this.streamCompletedSuccessfully = true;
            this.setState({ 
              messages: cleanMessages, // Remove status messages
              modelProviderError: true,
              isLoading: false 
            });
            return; // Exit early with graceful error handling
          }
        }
      }
      
      // CRITICAL FIX: Apply complete messages and mark content as received
      if (hasValidContent && newMessages.length > 0) {
        // console.log('[SecureChatClient] Applying', newMessages.length, 'complete messages, removing all status messages');
        
        // MEMORY LEAK FIX: Clear all timers since we got real content
        if (this.longProcessingTimer) {
          clearTimeout(this.longProcessingTimer);
          this.longProcessingTimer = null;
        }
        if (this.gracePeriodTimer) {
          clearTimeout(this.gracePeriodTimer);
          this.gracePeriodTimer = null;
        }
        
        // Get current messages and remove ALL status messages
        const currentMessages = [...this._state.messages];
        const nonStatusMessages = currentMessages.filter(msg => !msg.isStatus);
        
        // Mark that we've received real content BEFORE state update
        this.hasReceivedRealContent = true;
        
        // Update state with all new messages, ensuring status messages are removed
        this.setState({ 
          messages: [...nonStatusMessages, ...newMessages],
          isLoading: false // Mark as complete since we have the final response
        });

        // Ensure all running tool activities for this run flip to complete
        this.completeAllRunningForCurrentRun();
        
        // CRITICAL FIX: Mark that chunk processing handled completion successfully
        // This prevents the redundant completion logic from interfering
        this.streamCompletedSuccessfully = true;
        // Signal run completion for timeline Done rendering (only when we really start the final answer)
        this.markRunCompleted();
        
        // NEW: Record successful query completion for limit tracking
        if (this.querySuccessCallback && context?.userId) {
          try {
            this.querySuccessCallback(context.userId).catch(error => {
              console.error('[SecureChatClient] Error recording query success:', error);
              // Don't throw - this shouldn't break the chat flow
            });
          } catch (error) {
            console.error('[SecureChatClient] Error calling querySuccessCallback:', error);
          }
        }
        
        // console.log('[SecureChatClient] Complete messages applied successfully - marked as completed by chunk processing');
        return;
      } else {
        // console.log('[SecureChatClient] No valid content found in messages_complete event - no AI messages from Clera with content');
      }
    }

    // 4b. Handle tool update events surfaced by streaming service
    if (chunk.type === 'tool_update' && chunk.data) {
      const toolName = chunk.data.toolName || 'tool';
      const status = chunk.data.status;
      if (status === 'start') {
        this.addToolStart(toolName);
      } else if (status === 'complete') {
        this.markToolComplete(toolName);
      }
      return;
    }

    // 4c. Handle run completion events
    // Removed run_complete handling - TimelineBuilder will add "Done" naturally

    // 4c. Handle agent transfer events to update status bubble AND show in timeline
    if (chunk.type === 'agent_transfer' && chunk.data?.toAgent) {
      this.updateStatusForTransfer(chunk.data.toAgent);
      
      // Also add transfer to timeline based on agent name
      const agent = chunk.data.toAgent;
      if (agent === 'financial_analyst_agent') {
        this.addToolStart('transfer_to_financial_analyst_agent');
      } else if (agent === 'portfolio_management_agent') {
        this.addToolStart('transfer_to_portfolio_management_agent'); 
      } else if (agent === 'trade_execution_agent') {
        this.addToolStart('transfer_to_trade_execution_agent');
      } else if (agent === 'Clera') {
        // IMPORTANT: Do NOT add a timeline step here.
        // We only show "Putting it all together" when we actually receive
        // the backend-confirmed transfer_back_to_clera completion, or when
        // the first token of Clera's final answer starts (handled elsewhere).
      }
      return;
    }

    // 5. Handle messages metadata (progress indication)
    if (chunk.type === 'messages_metadata') {
      // console.log('[SecureChatClient] Received messages_metadata');
      // Just log for debugging, don't update UI state for metadata
      return;
    }

    // 6. Handle token-level streaming (if LangGraph sends token events)
    if (chunk.type === 'message_token' && chunk.data) {
      // console.log('[SecureChatClient] Received message_token');
      
      // Process token content
      let tokenContent = '';
      if (typeof chunk.data === 'string') {
        tokenContent = chunk.data;
      } else if (chunk.data.content) {
        tokenContent = chunk.data.content;
      }

        if (tokenContent) {
        const currentMessages = [...this._state.messages];
        
        // First token: Remove status message and start building response
          if (!this.hasReceivedRealContent) {
          // console.log('[SecureChatClient] First token received, removing status messages');
          this.hasReceivedRealContent = true;
          
          // Remove status messages and add new assistant message with first token
          const filteredMessages = currentMessages.filter(msg => !msg.isStatus);
          const newMessage: Message = { 
            role: 'assistant', 
            content: tokenContent,
            runId: this.currentQueryRunId || undefined
          };
          this.setState({ messages: [...filteredMessages, newMessage] });
            // Signal run completion for timeline Done rendering on first token
            this.markRunCompleted();
        } else {
          // Subsequent tokens: Append to existing assistant message
          const lastMessage = currentMessages[currentMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.isStatus) {
            // Append token to existing content
            lastMessage.content += tokenContent;
            this.setState({ messages: [...currentMessages] });
          } else {
            // Edge case: No existing assistant message, create new one
            const filteredMessages = currentMessages.filter(msg => !msg.isStatus);
            const newMessage: Message = { 
              role: 'assistant', 
              content: tokenContent,
              runId: this.currentQueryRunId || undefined
            };
            this.setState({ messages: [...filteredMessages, newMessage] });
          }
        }
      }
      return;
    }

    // 7. Handle other metadata and unknown events
    // console.log('[SecureChatClient] Received unhandled chunk type:', chunk.type, 'with data:', !!chunk.data);
    // Don't update UI for generic metadata events to prevent interference
  }

  private getNodeStatusMessage(nodeName: string): string {
    const nodeMessages: { [key: string]: string } = {
      'Clera': 'Analyzing your request...',
      'financial_analyst_agent': 'Researching financial data...',
      'portfolio_management_agent': 'Reviewing your portfolio...',
      'trade_execution_agent': 'Preparing trade information...',
      'tool_node': 'Gathering additional information...',
      'supervisor': 'Coordinating response...'
    };
    
    return nodeMessages[nodeName] || `🔄 Processing with ${nodeName}...`;
  }



  private isCurrentlyStreamingFinalResponse(): boolean {
    // Check if we have an assistant message that's being actively streamed (not a status message)
    const messages = this._state.messages;
    const lastMessage = messages[messages.length - 1];
    
    return lastMessage?.role === 'assistant' && 
           !lastMessage?.isStatus && 
           this.isStreaming &&
           (lastMessage?.content?.length || 0) > 0;
  }

  private detectAgentTransfers(messages: any[]): void {
    if (!Array.isArray(messages)) return;
    
    for (const message of messages) {
      // Look for tool messages that indicate successful transfers
      if (message?.type === 'tool' && message?.content && message?.name) {
        const content = message.content;
        const toolName = message.name;
        
        // Detect transfer completion messages
        if (typeof content === 'string' && content.includes('Successfully transferred to ')) {
          const agentMatch = content.match(/Successfully transferred to (\w+)/);
          if (agentMatch) {
            const targetAgent = agentMatch[1];
            //console.log(`[SecureChatClient] Detected transfer to: ${targetAgent}`);
            this.updateStatusForTransfer(targetAgent);
            return; // Only process first transfer per chunk
          }
        }
        
        // Also detect by tool name pattern
        if (toolName.startsWith('transfer_to_') && message?.status === 'success') {
          const targetAgent = toolName.replace('transfer_to_', '');
          //console.log(`[SecureChatClient] Detected transfer via tool name: ${targetAgent}`);
          this.updateStatusForTransfer(targetAgent);
          return;
        }
      }
    }
  }

  private updateStatusForTransfer(agentName: string): void {
    // Don't update if we've already received real content
    if (this.hasReceivedRealContent) {
      //console.log(`[SecureChatClient] Skipping status update - real content already received`);
      return;
    }
    
    //console.log(`[SecureChatClient] Updating status for transfer to: ${agentName}`);
    
    // Add status message for the new agent
    const statusMessage: Message = {
      role: 'assistant',
      content: this.getNodeStatusMessage(agentName),
      isStatus: true
    };
    
    // Remove any existing status messages and add the new one
    const messages = this._state.messages.filter(msg => !msg.isStatus);
    const newMessages = [...messages, statusMessage];
    
    //console.log(`[SecureChatClient] Status update - preserving ${messages.length} non-status messages, adding new status`);
    
    this.setState({ messages: newMessages });
  }

  private formatProgressUpdate(data: any): string {
    if (typeof data === 'string') {
      return data;
    }
    
    if (data && typeof data === 'object') {
      if (data.message) return data.message;
      if (data.status) return data.status;
      if (data.progress) return `Progress: ${data.progress}`;
    }
    
    return 'Processing...';
  }

  clearModelProviderError() {
    this.setState({ modelProviderError: false });
  }

  // ARCHITECTURE FIX: Proper separation of concerns - networking layer notifies, UI layer handles presentation
  setLongProcessingCallback(callback: () => void) {
    this.longProcessingCallback = callback;
  }

  // MEMORY LEAK FIX: Clear callback to prevent setState on unmounted component
  clearLongProcessingCallback() {
    this.longProcessingCallback = null;
  }

  setQuerySuccessCallback(callback: (userId: string) => Promise<void>) {
    this.querySuccessCallback = callback;
  }

  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // MEMORY LEAK FIX: Clear all timers and callbacks on cleanup to prevent setState after unmount
    if (this.longProcessingTimer) {
      clearTimeout(this.longProcessingTimer);
      this.longProcessingTimer = null;
    }
    if (this.gracePeriodTimer) {
      clearTimeout(this.gracePeriodTimer);
      this.gracePeriodTimer = null;
    }
    
    // MEMORY LEAK FIX: Clear callback to prevent setState on unmounted component
    this.longProcessingCallback = null;
    this.querySuccessCallback = null;
    
    this.stateListeners.clear();
  }
}

// Hook to use the secure chat client
export function useSecureChat(): SecureChatClient {
  const [client] = useState(() => new SecureChatClientImpl());
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const unsubscribe = client.subscribe(() => {
      forceUpdate({});
    });

    return () => {
      unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    return () => {
      client.cleanup();
    };
  }, [client]);

  return client;
}

// We need these imports for the hook
import { useState, useEffect } from 'react'; 