"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@/utils/api/chat-client'; // Use the Message type imported above
import { useStream } from '@langchain/langgraph-sdk/react'; // Import the hook
import { Message as LangGraphMessage, Interrupt } from '@langchain/langgraph-sdk'; // Type for SDK messages and Interrupt type
import { 
  saveChatHistory, 
  loadChatHistory,
  formatChatTitle,
  updateChatThreadTitle,
  ChatSession
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SendIcon, XIcon, RefreshCcw, CheckIcon, BanIcon } from 'lucide-react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import ChatSkeleton from './ChatSkeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

// Define the expected state type and interrupt type
type GraphStateType = { 
  messages: LangGraphMessage[]; 
};
// Define the expected type of the interrupt value if known, otherwise use unknown or string
type InterruptValueType = string; // Assuming the interrupt value is the prompt string

interface ChatProps {
  accountId: string;
  userId?: string;
  onClose: () => void;
  isFullscreen?: boolean;
  sessionId?: string; // This will be the thread_id for useStream
  initialMessages?: Message[]; // Use the Message type imported above
  onMessageSent?: () => void;
  onSessionCreated?: (sessionId: string) => void;
  onTitleUpdated?: (sessionId: string, newTitle: string) => void;
}

// Helper function adjusted to filter for supervisor-orchestrated messages
function convertMessageFormat(lgMsg: LangGraphMessage): Message | null { 
    // Allow human messages
    if (lgMsg.type === 'human') {
      const content = typeof lgMsg.content === 'string' ? lgMsg.content : JSON.stringify(lgMsg.content);
      return {
          role: 'user', 
          content: content
      };
    }

    // Process AI messages
    if (lgMsg.type === 'ai') {
        // Check for the 'name' attribute in lgMsg which indicates messages from specific worker agents
        // as seen in the LangGraph stream examples like: HumanMessage(..., name='researcher')
        const hasAgentName = 'name' in lgMsg && !!lgMsg.name;
        
        // Filter out all messages with tool calls
        if (lgMsg.tool_calls && lgMsg.tool_calls.length > 0) {
            return null;
        }
        
        // Filter out messages from specific worker agents (with 'name' attribute)
        // We only want to display messages without 'name' or with name='Clera'
        if (hasAgentName && lgMsg.name !== 'Clera') {
            return null;
        }
        
        // For messages that pass filtering, ensure content is a simple string
        if (typeof lgMsg.content === 'string') {
            return {
                role: 'assistant', 
                content: lgMsg.content
            };
        } else {
            // Filter out non-string content
            return null;
        }
    }

    // Filter out all other message types (e.g., 'tool', 'system')
    return null;
}

export default function Chat({ 
  accountId, 
  userId,
  onClose, 
  isFullscreen = false,
  sessionId: initialSessionId, // Rename to initialThreadId for clarity?
  initialMessages = [], // Keep initialMessages for potential display before stream connects?
  onMessageSent,
  onSessionCreated,
  onTitleUpdated
}: ChatProps) {
  // State managed by useStream replaces manual message/loading state
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialSessionId || null);
  const [hasTitleBeenUpdated, setHasTitleBeenUpdated] = useState(false);
  
  // TODO: Get these from environment variables
  const apiUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || 'http://localhost:8000'; // Ensure this points to your FastAPI server
  const apiKey = process.env.NEXT_PUBLIC_LANGGRAPH_API_KEY; // Optional, depends on backend auth
  const assistantId = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID || 'agent'; // The graph ID/name to run
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- LangGraph useStream Hook --- 
  // Specify InterruptType in the hook's generics
  const thread = useStream<GraphStateType, { InterruptType: InterruptValueType }>({
    apiUrl, 
    apiKey: apiKey ?? undefined, 
    assistantId, 
    threadId: currentThreadId, 
    messagesKey: 'messages',
    onThreadId: (id) => { 
      console.log("useStream using threadId:", id);
      if (id !== currentThreadId) {
        setCurrentThreadId(id);
        if (onSessionCreated) onSessionCreated(id);
      }
    },
    onError: (err: unknown) => {  
        console.error("useStream Hook Error:", err);
    },
  });
  // --- End LangGraph useStream Hook --- 

  // Derived state uses the updated filter
  const messagesToDisplay: Message[] = (thread.messages || [])
    .map(convertMessageFormat)
    .filter((msg): msg is Message => msg !== null); 
  const isProcessing = thread.isLoading;
  const error = thread.error;
  const interrupt = thread.interrupt; 
  const isInterrupting = interrupt !== undefined; 
  const interruptMessage = isInterrupting ? String(interrupt.value) : null; 

  // Handle input submission
  const handleSendMessage = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isProcessing || isInterrupting) return;

    const contentToSend = trimmedInput;
    setInput('');

    // Check if this is the first message (no user messages in the conversation yet)
    const isFirstMessage = !messagesToDisplay.some(msg => msg.role === 'user');
    
    // Input for the graph run
    const runInput = {
        messages: [{ type: 'human' as const, content: contentToSend }],
    };
    
    // Ensure values are non-null before sending
    const userIdToSend = userId || '';
    const accountIdToSend = accountId || '';
    
    // Explicitly structure the run options with all required properties
    const submitOptions = {
      config: {
        configurable: {
          user_id: userIdToSend,
          account_id: accountIdToSend
        }
      },
      optimisticValues(prev: GraphStateType) {
        const prevMessages = prev.messages ?? [];
        // Optimistic update uses LangGraphMessage format
        const newMessage: LangGraphMessage = { 
            type: 'human' as const, 
            content: contentToSend,
            id: `temp-${Date.now()}` 
        };
        return { ...prev, messages: [...prevMessages, newMessage] };
      }
    };

    console.log("Submitting input via thread.submit:", runInput, "with options:", JSON.stringify({
      config: submitOptions.config
    }));    
    
    try {
      thread.submit(runInput, submitOptions);
      
      // If this is the first message and we have a thread ID, update the title
      if (isFirstMessage && currentThreadId && !hasTitleBeenUpdated) {
        const newTitle = formatChatTitle(contentToSend);
        console.log(`Updating thread title to: ${newTitle}`);
        
        // Update the title in the database
        updateChatThreadTitle(currentThreadId, newTitle)
          .then(success => {
            if (success) {
              console.log(`Successfully updated title for thread ${currentThreadId}`);
              setHasTitleBeenUpdated(true);
              // Notify parent component if callback exists
              if (onTitleUpdated) {
                onTitleUpdated(currentThreadId, newTitle);
              }
            } else {
              console.error(`Failed to update title for thread ${currentThreadId}`);
            }
          })
          .catch(err => {
            console.error('Error updating chat title:', err);
          });
      }
    } catch (err) {
        console.error("Error calling thread.submit:", err);
    }

  }, [input, isProcessing, isInterrupting, thread, userId, accountId, currentThreadId, messagesToDisplay, hasTitleBeenUpdated, onTitleUpdated]); // Added new dependencies

  // Handle interrupt confirmation
  const handleInterruptConfirmation = useCallback((confirmationString: 'yes' | 'no') => { 
    console.log("Resuming interrupt with value:", confirmationString, "with user_id:", userId, "and account_id:", accountId);
    if (!isInterrupting) return;
    
    // Ensure values are non-null before sending
    const userIdToSend = userId || '';
    const accountIdToSend = accountId || '';
    
    try { 
      // Explicitly structure the run options with all required properties
      const resumeOptions = {
        command: { resume: confirmationString },
        config: {
          configurable: {
            user_id: userIdToSend,
            account_id: accountIdToSend
          }
        }
      };
      
      console.log("Submitting resume with options:", JSON.stringify(resumeOptions));
      thread.submit(undefined, resumeOptions);
    } catch (err) { 
      console.error("Error calling thread.submit for resume:", err); 
    }
  }, [isInterrupting, thread, userId, accountId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesToDisplay]);

  // Focus input
  useEffect(() => {
    if (!isProcessing && !isInterrupting) {
    inputRef.current?.focus();
    }
  }, [isProcessing, isInterrupting]);

  // Update internal state and clear input when the session ID prop changes
  useEffect(() => {
      console.log("Chat component received session/thread ID prop:", initialSessionId);
      const newThreadId = initialSessionId ?? null;
      setCurrentThreadId(newThreadId);
      
      // Clear input when starting a new chat (ID becomes null)
      if (newThreadId === null) {
          setInput('');
          setHasTitleBeenUpdated(false); // Reset the title update tracker for new chats
          // Optionally clear displayed messages if desired, though useStream might handle this
          // setMessages([]); // This might conflict with useStream state
      } else {
          // For existing threads, check if they already have a custom title
          // If the title is not "New Conversation", then it's already been updated
          setHasTitleBeenUpdated(false); // We'll check based on API responses instead
      }
      
      // Reset interrupt state if session changes
      // Note: thread.interrupt should update automatically based on the new thread state fetched by useStream
      // We don't need manual reset for isInterrupting/interruptMessage derived from thread.interrupt

  }, [initialSessionId]);

  // Create a string representation of the error, or null if no error
  const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : null;

  return (
    <div className={`flex flex-col ${isFullscreen ? 'h-full' : 'h-full relative bg-background shadow-lg border rounded-lg'}`}>
      {!isFullscreen && (
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <CleraAvatar />
            <span className="font-semibold">Clera</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="icon" 
              disabled={isProcessing}
              title="Refresh (handled by SDK)"
            >
              <RefreshCcw size={18} className={isProcessing ? "animate-spin" : ""} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              aria-label="Close chat"
            >
              <XIcon size={18} />
            </Button>
          </div>
        </div>
      )}
      
      <ScrollArea className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesToDisplay.map((msg: Message, index: number) => (
            <ChatMessage 
            key={`msg-${index}`}
            message={msg}
            isLast={index === messagesToDisplay.length - 1 && !isProcessing && !isInterrupting}
          />
        ))}
        
        {isInterrupting && (
          <div className="p-4 m-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-center">
            <p className="text-sm text-blue-900 mb-3 whitespace-pre-wrap">{interruptMessage || 'Action Required'}</p>
            <div className="flex justify-center space-x-3">
              <Button 
                variant="outline" 
                className="border-gray-400 text-gray-700 hover:bg-gray-100"
                size="sm"
                onClick={() => handleInterruptConfirmation('no')}
                disabled={isProcessing}
              >
                <BanIcon className="mr-2 h-4 w-4" /> No
              </Button>
              <Button 
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                size="sm"
                onClick={() => handleInterruptConfirmation('yes')}
                disabled={isProcessing}
              >
                <CheckIcon className="mr-2 h-4 w-4" /> Yes
              </Button>
            </div>
          </div>
        )}
        
        {isProcessing && !isInterrupting && <ChatSkeleton />}
        
        <div ref={messagesEndRef} />
      </ScrollArea>
      
      <div className="p-4 border-t">
        {/* Use the pre-formatted errorMessage string */}
        {errorMessage && (
            <div className="text-red-500 text-sm mb-2">Error: {errorMessage}</div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex space-x-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isInterrupting ? "Confirm or deny above..." : "Ask about your portfolio..."}
            disabled={isProcessing || isInterrupting}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isProcessing && !isInterrupting) {
                e.preventDefault(); 
                handleSendMessage();
              }
            }}
          />
          {isProcessing ? (
            <Button type="button" variant="destructive" size="icon" onClick={() => thread.stop?.()} title="Stop generation">
              <XIcon size={18} />
            </Button>
          ) : (
          <Button 
            type="submit" 
              disabled={!input.trim() || isProcessing || isInterrupting}
            size="icon"
          >
            <SendIcon size={18} />
          </Button>
          )}
        </form>
      </div>
    </div>
  );
} 