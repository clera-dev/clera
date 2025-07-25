import { Message } from './chat-client';

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
}

export interface SecureChatClient {
  readonly state: ChatState;
  handleInterrupt: (threadId: string, runId: string, response: any) => Promise<void>;
  startStream: (threadId: string, input: any, userId: string, accountId: string) => Promise<void>;
  clearError: () => void;
  setMessages: (messages: Message[]) => void;
  addMessagesWithStatus: (userMessage: Message) => void;
  subscribe: (listener: () => void) => () => void;
  cleanup: () => void;
}

export class SecureChatClientImpl implements SecureChatClient {
  private _state: ChatState = {
    messages: [],
    isLoading: false,
    error: null,
    interrupt: null,
  };
  
  private stateListeners: Set<() => void> = new Set();
  private eventSource: EventSource | null = null;
  private isStreaming: boolean = false;
  private hasReceivedRealContent: boolean = false; // Track if real content has been received
  private hasReceivedInterrupt: boolean = false; // Track if an interrupt has been received

  /**
   * Returns an immutable copy of the current state
   * Prevents external mutation and maintains encapsulation
   */
  get state(): ChatState {
    return {
      messages: [...this._state.messages], // Shallow copy of messages array
      isLoading: this._state.isLoading,
      error: this._state.error,
      interrupt: this._state.interrupt ? { ...this._state.interrupt } : null // Deep copy of interrupt object
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

  setMessages(messages: Message[]) {
    this.setState({ messages: [...messages] }); // Create defensive copy
  }

  addMessagesWithStatus(userMessage: Message) {
    // Add both user message and status message atomically to prevent timing issues
    const statusMessage: Message = {
      role: 'assistant',
      content: 'Analyzing your request...',
      isStatus: true
    };
    
    // Ensure we preserve all existing messages and add the new ones atomically
    const newMessages = [...this._state.messages, userMessage, statusMessage];
    
    this.setState({ 
      messages: newMessages
    });
  }

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
                this.handleStreamChunk(data);
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
      console.error('[SecureChatClient] Error handling interrupt:', error);
      
      // Reset flags on error
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false;
      
      this.setState({ 
        error: error.message || 'Failed to handle interrupt',
        isLoading: false,
        interrupt: currentInterrupt // Restore interrupt on error
      });
      this.isStreaming = false; // Unset streaming flag on error
    }
  }

  async startStream(threadId: string, input: any, userId: string, accountId: string): Promise<void> {
    try {
      // console.log('[SecureChatClient] Starting stream for thread:', threadId);
      
      // CRITICAL FIX: Reset streaming state at the beginning of each stream
      // This ensures status messages don't persist from previous streams
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false; // Reset interrupt tracking
      this.isStreaming = true;
      
      this.setState({ isLoading: true, error: null });
      
      // Status message is now added by the caller before startStream is called
      // This prevents timing issues with React batching

      // Close existing stream if any
      if (this.eventSource) {
        // console.log('[SecureChatClient] Closing existing stream');
        this.eventSource.close();
      }

      // console.log('[SecureChatClient] Making stream request to /api/conversations/stream-chat');

      // Start new stream
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
        }),
      });

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

      // console.log('[SecureChatClient] Stream response received, starting to read chunks');

      // Create EventSource from the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // console.log('[SecureChatClient] Stream reading completed, total chunks processed:', chunkCount);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            chunkCount++;
            try {
              const data = JSON.parse(line.slice(6));
              // console.log(`[SecureChatClient] Processing chunk ${chunkCount}:`, { type: data.type });
              this.handleStreamChunk(data);
            } catch (e) {
              console.error('[SecureChatClient] Error parsing stream chunk:', e, 'Line:', line);
            }
          }
        }
      }

      // console.log('[SecureChatClient] Stream completed successfully, final state:', {
      //   hasReceivedRealContent: this.hasReceivedRealContent,
      //   hasReceivedInterrupt: this.hasReceivedInterrupt,
      //   messageCount: this._state.messages.length,
      //   totalChunksProcessed: chunkCount
      // });
      
      // CRITICAL FIX: Consider both real content AND interrupts as valid responses
      // GraphInterrupts (trade confirmations) are valid responses, not errors
      const hasValidResponse = this.hasReceivedRealContent || this.hasReceivedInterrupt;
      
      if (hasValidResponse) {
        this.setState({ isLoading: false });
        // console.log('[SecureChatClient] Stream completed with valid response');
      } else {
        console.warn('[SecureChatClient] Stream completed with no valid response (no content or interrupt)');
        this.setState({ 
          error: 'No response received from agent. Please try again.',
          isLoading: false 
        });
      }
      
      this.isStreaming = false;

    } catch (error: any) {
      console.error('[SecureChatClient] Error starting stream:', error);
      console.error('[SecureChatClient] Error details:', {
        message: error.message,
        stack: error.stack,
        threadId,
        userId,
        accountId
      });
      
      // CRITICAL FIX: Reset streaming flags on error to prevent stuck states
      this.hasReceivedRealContent = false;
      this.hasReceivedInterrupt = false; // Reset interrupt tracking on error
      this.isStreaming = false;
      
      this.setState({ 
        error: error.message || 'Failed to start stream',
        isLoading: false 
      });
    }
  }

  private handleStreamChunk(chunk: any) {
    // console.log('[SecureChatClient] Stream chunk received:', {
    //   type: chunk.type,
    //   hasData: !!chunk.data,
    //   metadata: chunk.metadata,
    //   dataKeys: chunk.data ? Object.keys(chunk.data) : [],
    //   currentState: {
    //     isStreaming: this.isStreaming,
    //     hasReceivedRealContent: this.hasReceivedRealContent,
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
      // console.log('[SecureChatClient] Processing GraphInterrupt:', chunk.data);
      
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
      // console.log('[SecureChatClient] Marked interrupt as valid response');
      
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
      // console.log(`[SecureChatClient] Node update for: ${nodeName}`);
      
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
      return;
    }

    // 4. Handle complete messages from agents - CRITICAL PATH FOR BUG FIX
    if (chunk.type === 'messages_complete' && chunk.data && Array.isArray(chunk.data)) {
      // console.log('[SecureChatClient] Processing complete messages:', {
      //   messageCount: chunk.data.length,
      //   isCompleteResponse: chunk.metadata?.isCompleteResponse
      // });
      
      // Process all AI messages from Clera
      const newMessages: Message[] = [];
      let hasValidContent = false;
      
      for (const messageData of chunk.data) {
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
            
            // Create new message with safe ID assignment
            const newMessage: Message = { 
              role: 'assistant', 
              content: content.trim(),
              ...(messageData.id !== undefined && { id: messageData.id })
            };
            
            newMessages.push(newMessage);
          }
        }
      }
      
      // CRITICAL FIX: Apply complete messages and mark content as received
      if (hasValidContent && newMessages.length > 0) {
        // console.log('[SecureChatClient] Applying', newMessages.length, 'complete messages, removing all status messages');
        
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
        
        // console.log('[SecureChatClient] Complete messages applied successfully');
        return;
      } else {
        // console.log('[SecureChatClient] No valid content found in messages_complete event');
      }
    }

    // 5. Handle messages metadata (progress indication)
    if (chunk.type === 'messages_metadata') {
      // console.log('[SecureChatClient] Received messages metadata, stream is progressing');
      // Just log for debugging, don't update UI state for metadata
      return;
    }

    // 6. Handle token-level streaming (if LangGraph sends token events)
    if (chunk.type === 'message_token' && chunk.data) {
      // console.log('[SecureChatClient] Received message token (legacy support)');
      
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
          const newMessage: Message = { role: 'assistant', content: tokenContent };
          this.setState({ messages: [...filteredMessages, newMessage] });
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
            const newMessage: Message = { role: 'assistant', content: tokenContent };
            this.setState({ messages: [...filteredMessages, newMessage] });
          }
        }
      }
      return;
    }

    // 7. Handle other metadata and unknown events
    // console.log('[SecureChatClient] Received metadata or unknown event type:', chunk.type);
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

  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
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