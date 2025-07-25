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
      this.isStreaming = true; // Ensure streaming flag is set for token aggregation
      
      const userId = localStorage.getItem('userId');
      const accountId = localStorage.getItem('alpacaAccountId');
      
      if (!userId || !accountId) {
        throw new Error('User ID or Account ID not found');
      }

      // Close existing stream before starting interrupt handling
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      // Use fetch + ReadableStream for SSE, sending PII in POST body
      const responseStream = await fetch('/api/conversations/handle-interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          run_id: runId,
          response,
          user_id: userId,
          account_id: accountId,
        }),
      });

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
                console.error('Error parsing SSE chunk:', err);
              }
            }
          }
        }
      }
      this.setState({ isLoading: false });
      this.isStreaming = false; // Unset streaming flag when done
    } catch (error: any) {
      console.error('Error handling interrupt:', error);
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
      this.setState({ isLoading: true, error: null });
      this.isStreaming = true;
      this.hasReceivedRealContent = false; // Reset for new stream
      
      // Status message is now added by the caller before startStream is called
      // This prevents timing issues with React batching

      // Close existing stream if any
      if (this.eventSource) {
        this.eventSource.close();
      }

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
        console.error(`[SecureChatClient] Stream response error:`, errorText);
        
        // Try to parse as JSON for structured error, fallback to text
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}: ${errorText}`);
      }

      // Create EventSource from the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              this.handleStreamChunk(data);
            } catch (e) {
              console.error('Error parsing stream chunk:', e, 'Line:', line);
            }
          }
        }
      }

      //console.log('[SecureChatClient] Stream completed successfully');
      this.setState({ isLoading: false });
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
      this.setState({ 
        error: error.message || 'Failed to start stream',
        isLoading: false 
      });
      this.isStreaming = false;
    }
  }

  private handleStreamChunk(chunk: any) {
    //console.log('[SecureChatClient] Stream chunk received:', chunk);
    //console.log('[SecureChatClient] Chunk type:', chunk.type, 'Data keys:', Object.keys(chunk.data || {}));
    //console.log('[SecureChatClient] Current state:', {
    //  isStreaming: this.isStreaming,
    //  hasReceivedRealContent: this.hasReceivedRealContent,
    //  messageCount: this._state.messages.length,
    //  isLoading: this._state.isLoading
    //});
    
    // Handle different chunk types
    if (chunk.type === 'error') {
      console.error('[SecureChatClient] Stream error chunk:', chunk);
      this.setState({ 
        error: chunk.data?.error || 'Stream error',
        isLoading: false 
      });
      return;
    }

    // Handle GraphInterrupt events
    if (chunk.type === 'interrupt') {
      //console.log('[SecureChatClient] Processing GraphInterrupt:', chunk.data);
      //console.log('[SecureChatClient] Full interrupt chunk:', chunk);
      
      // GraphInterrupt structure: { value, resumable, ns, when }
      let interruptData = chunk.data;
      
      // Handle array format (if multiple interrupts)
      if (Array.isArray(chunk.data) && chunk.data.length > 0) {
        interruptData = chunk.data[0];
      }
      
      // Extract interrupt information based on LangGraph format
      const value = interruptData?.value || interruptData || 'Confirmation required';
      const resumable = interruptData?.resumable !== false; // default to true
      const ns = interruptData?.ns || [];
      
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

        // Handle node execution updates for progressive feedback
    if (chunk.type === 'node_update' && chunk.nodeName) {
      //console.log(`[SecureChatClient] Node ${chunk.nodeName} executed:`, chunk.data);
      
      // Skip status messages if we've already received real content (complete response)
      if (this.hasReceivedRealContent) {
        //console.log('[SecureChatClient] Skipping status message - real content already received');
        return;
      }
      
      // Add a temporary status message showing progress
      const statusMessage: Message = {
        role: 'assistant',
        content: this.getNodeStatusMessage(chunk.nodeName),
        isStatus: true
      };
      
      // Remove any existing status messages and add the new one
      const messages = this._state.messages.filter(msg => !msg.isStatus);
      messages.push(statusMessage);
      
      //console.log('[SecureChatClient] Setting status message:', statusMessage);
      this.setState({ messages });
      return;
    }

    // Handle token-level streaming from LLM
    if (chunk.type === 'message_token') {
      //console.log('[SecureChatClient] Received message token:', chunk.data);
      
      // Handle different token formats from LangGraph
      let content = '';
      if (Array.isArray(chunk.data)) {
        // Handle array of tokens: [(token, metadata), ...]
        for (const item of chunk.data) {
          if (Array.isArray(item) && item.length >= 1) {
            const tokenData = item[0];
            if (typeof tokenData === 'string') {
              content += tokenData;
            } else if (tokenData?.content) {
              content += tokenData.content;
            }
          }
        }
      } else if (chunk.data?.messageChunk?.content) {
        // Handle structured format: {messageChunk: {content: "..."}, metadata: {...}}
        content = chunk.data.messageChunk.content;
      } else if (chunk.data?.content) {
        // Handle direct content: {content: "..."}
        content = chunk.data.content;
      }
      
      if (content) {
        //console.log('[SecureChatClient] Processing token content:', content);
        
        // Mark that we've received real content
        this.hasReceivedRealContent = true;
        
        const messages = [...this._state.messages];
        
        // Remove any status messages when real content starts coming
        const filteredMessages = messages.filter(msg => !msg.isStatus);
        
        // Check if there's already an assistant message to update (for streaming)
        const lastMessage = filteredMessages[filteredMessages.length - 1];
        
        if (lastMessage && lastMessage.role === 'assistant' && this.isStreaming && !lastMessage.isStatus) {
          // Append to existing assistant message for streaming effect
          lastMessage.content += content;
          //console.log('[SecureChatClient] Appending to existing message, new length:', lastMessage.content.length);
          this.setState({ messages: [...filteredMessages] });
        } else {
          // Add new assistant message
          const newMessage: Message = {
            role: 'assistant',
            content: content
          };
          //console.log('[SecureChatClient] Creating new message with content:', content);
          this.setState({ messages: [...filteredMessages, newMessage] });
        }
      }
      return;
    }

    // Handle progress updates from tools/nodes
    if (chunk.type === 'progress_update') {
      //console.log('Progress update:', chunk.data);
      
      // Add a temporary status message
      const statusMessage: Message = {
        role: 'assistant',
        content: this.formatProgressUpdate(chunk.data),
        isStatus: true
      };
      
      const messages = this._state.messages.filter(msg => !msg.isStatus);
      messages.push(statusMessage);
      
      this.setState({ messages });
      return;
    }

    // Handle LangGraph messages streaming (complete messages from 'messages' stream mode)
    if (chunk.type === 'messages' && chunk.data && Array.isArray(chunk.data)) {
      //console.log('[SecureChatClient] Received messages chunk:', chunk.data);
      
      // Collect all new AI messages first to avoid state overwriting bug
      const newMessages: Message[] = [];
      let hasProcessedMessage = false;
      
      for (const messageData of chunk.data) {
        if (messageData && messageData.type === 'ai' && messageData.name === 'Clera') {
          // Check for agent transfers before processing
          this.detectAgentTransfers([messageData]);
          
          // Extract content from AI message
          let content = '';
          if (typeof messageData.content === 'string') {
            content = messageData.content;
          } else if (Array.isArray(messageData.content) && messageData.content.length > 0) {
            content = messageData.content.map((item: any) => 
              typeof item === 'string' ? item : (item.text || JSON.stringify(item))
            ).join('');
          }

          //console.log('[SecureChatClient] Processing AI message content:', content);

          if (content && content.trim().length > 0) {
            this.hasReceivedRealContent = true;
            hasProcessedMessage = true;
            
            // Create new message with safe ID assignment
            const newMessage: Message = { 
              role: 'assistant', 
              content: content,
              ...(messageData.id !== undefined && { id: messageData.id }) // Only add ID if it exists
            };
            
            newMessages.push(newMessage);
            //console.log('[SecureChatClient] Collected message:', newMessage);
          }
        }
      }
      
      // Apply all new messages in a single setState call to prevent state overwriting
      if (hasProcessedMessage && newMessages.length > 0) {
        const currentMessages = [...this._state.messages];
        const filteredMessages = currentMessages.filter(msg => !msg.isStatus);
        
        //console.log('[SecureChatClient] Setting all messages state:', newMessages);
        
        this.setState({ 
          messages: [...filteredMessages, ...newMessages],
          isLoading: false // Mark loading as complete only once
        });
        
        // Mark streaming as complete only once
        this.isStreaming = false;
        return;
      }
    }

    // Handle token-level streaming chunks (if LangGraph sends token events)
    if (chunk.type === 'message_token' && chunk.data) {
      //console.log('[SecureChatClient] Received message token:', chunk.data);
      
      // Process token content
      let tokenContent = '';
      if (typeof chunk.data === 'string') {
        tokenContent = chunk.data;
      } else if (chunk.data.content) {
        tokenContent = chunk.data.content;
      }

      if (tokenContent) {
        //console.log('[SecureChatClient] Processing token:', tokenContent);
        
        const currentMessages = [...this._state.messages];
        
        // First token: Remove status message and start building response
        if (!this.hasReceivedRealContent) {
          //console.log('[SecureChatClient] First token received, removing status message');
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
    }
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