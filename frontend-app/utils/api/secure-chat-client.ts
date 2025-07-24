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
    
    this.setState({ 
      messages: [...this._state.messages, userMessage, statusMessage] 
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start stream');
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
              console.error('Error parsing stream chunk:', e);
            }
          }
        }
      }

      this.setState({ isLoading: false });
      this.isStreaming = false;

    } catch (error: any) {
      console.error('Error starting stream:', error);
      this.setState({ 
        error: error.message || 'Failed to start stream',
        isLoading: false 
      });
      this.isStreaming = false;
    }
  }

  private handleStreamChunk(chunk: any) {
    console.log('Stream chunk received:', chunk);
    
    // Handle different chunk types
    if (chunk.type === 'error') {
      this.setState({ 
        error: chunk.data?.error || 'Stream error',
        isLoading: false 
      });
      return;
    }

    // Handle GraphInterrupt events
    if (chunk.type === 'interrupt') {
      console.log('Processing GraphInterrupt:', chunk.data);
      
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
      console.log(`Node ${chunk.nodeName} executed:`, chunk.data);
      
      // Don't add status messages if we've already received real content
      if (this.hasReceivedRealContent) {
        console.log('Skipping status message - real content already received');
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
      
      this.setState({ messages });
      return;
    }

    // Handle token-level streaming from LLM
    if (chunk.type === 'message_token') {
      const { messageChunk, metadata } = chunk.data;
      const content = messageChunk.content || '';
      
      if (content.trim()) {
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
          this.setState({ messages: filteredMessages });
        } else {
          // Add new assistant message
          const newMessage: Message = {
            role: 'assistant',
            content: content
          };
          filteredMessages.push(newMessage);
          this.setState({ messages: filteredMessages });
        }
      }
      return;
    }

    // Handle progress updates from tools/nodes
    if (chunk.type === 'progress_update') {
      console.log('Progress update:', chunk.data);
      
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

    // Handle message updates (legacy and current format)
    if (chunk.type === 'messages' && chunk.data && Array.isArray(chunk.data)) {
      // Mark that we've received real content
      this.hasReceivedRealContent = true;
      
      // Remove any status messages when real messages arrive
      const messages = this._state.messages.filter(msg => !msg.isStatus);
      
      // Process each message in the data array
      for (const message of chunk.data) {
        if (message && message.type === 'ai' && message.name === 'Clera') {
          // Extract content from AI message
          let content = '';
          if (typeof message.content === 'string') {
            content = message.content;
          } else if (Array.isArray(message.content) && message.content.length > 0) {
            // Handle array content (typical LangGraph format)
            content = message.content.map((item: any) => 
              typeof item === 'string' ? item : (item.text || JSON.stringify(item))
            ).join('');
          } else {
            content = JSON.stringify(message.content);
          }

          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.isStatus) {
            // Append to existing assistant message for streaming effect
            lastMessage.content += content;
            this.setState({ messages: [...messages] });
          } else {
            // Add new assistant message
            const newMessage: Message = { role: 'assistant', content: content };
            this.setState({ messages: [...messages, newMessage] });
          }
          break; // Only process first AI message per chunk
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
    
    return nodeMessages[nodeName] || `Processing ${nodeName}...`;
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