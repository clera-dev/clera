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
  createChatSession,
  ChatSession
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  userId: string; // changed from `userID?` in case that was why it wasn't being passed
  onClose: () => void;
  isFullscreen?: boolean;
  sessionId?: string; // This will be the thread_id for useStream
  initialMessages?: Message[]; // Use the Message type imported above
  onMessageSent?: () => void;
  onQuerySent?: () => Promise<void>;
  isLimitReached: boolean;
  onSessionCreated?: (sessionId: string) => void;
}

// Helper function simplified to mainly pass through human/assistant messages
// and rely on thread.interrupt for interrupt handling.
function convertMessageFormat(lgMsg: LangGraphMessage): Message | null {

    // Direct pass-through for human messages
    if (lgMsg.type === 'human') {
      const content = typeof lgMsg.content === 'string' ? lgMsg.content : JSON.stringify(lgMsg.content);
      return {
          role: 'user',
          content: content
      };
    }

    // Process AI messages
    if (lgMsg.type === 'ai') {
        // Filter out messages not explicitly named 'Clera'
        // Use optional chaining and type assertion as needed for safety.
        if ((lgMsg as any)?.name !== 'Clera') {
            return null; // Filter out if not from Clera
        }

        // Filter out messages with tool calls
        if (lgMsg.tool_calls && lgMsg.tool_calls.length > 0) {
            return null;
        }

        // Handle different content formats for Clera's messages
        let content = '';
        if (typeof lgMsg.content === 'string') {
            content = lgMsg.content;
        } else if (Array.isArray(lgMsg.content)) {
             // Handle array of content blocks, safely filtering for text items using a type guard
             content = lgMsg.content
                .filter((item): item is { type: 'text'; text: string } => // Type guard
                    typeof item === 'object' &&
                    item !== null &&
                    item.type === 'text' &&
                    typeof (item as any).text === 'string' // Check text property exists and is string
                )
                .map(item => item.text) // Now safe to access item.text
                .join('');
        } else {
             return null; // Filter out if content format is not recognized/handled
        }

        // Only return if there is actual text content
        if (content.trim()) {
            return {
                role: 'assistant',
                content: content
            };
        } else {
             return null; // Filter out empty messages too
        }
    }

    // Filter out all other message types (e.g., 'tool', 'system') by default
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
  onQuerySent,
  isLimitReached,
  onSessionCreated,
}: ChatProps) {
  // State managed by useStream replaces manual message/loading state
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialSessionId || null);
  const [isCreatingSession, setIsCreatingSession] = useState(false); // Added loading state for session creation
  
  // TODO: Get these from environment variables
  const apiUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || 'http://localhost:8000';
  const apiKey = process.env.NEXT_PUBLIC_LANGGRAPH_API_KEY; // Optional, depends on backend auth
  const assistantId = process.env.NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID || 'agent'; // The graph ID/name to run
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); // Ref for the scrollable container

  // --- LangGraph useStream Hook --- 
  // Specify InterruptType in the hook's generics
  const thread = useStream<GraphStateType, { InterruptType: InterruptValueType }>({
    apiUrl, 
    apiKey: apiKey ?? undefined, 
    assistantId, 
    threadId: currentThreadId, 
    messagesKey: 'messages',
    onError: (err: unknown) => {  
        console.error("useStream Hook Error:", err);
    },
  });
  // --- End LangGraph useStream Hook --- 

  // Derived state uses the updated filter
  const messagesToDisplay: Message[] = (thread.messages || [])
    .map(convertMessageFormat)
    .filter((msg): msg is Message => msg !== null); 
  const isProcessing = thread.isLoading || isCreatingSession;
  const error = thread.error;
  const interrupt = thread.interrupt; 
  const isInterrupting = interrupt !== undefined; 
  const interruptMessage = isInterrupting ? String(interrupt.value) : null; 

  // Handle input submission
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isProcessing || isInterrupting) return;

    const contentToSend = trimmedInput;
    setInput('');

    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to recalculate
      inputRef.current.rows = 1; // Reset rows
    }

    let targetThreadId = currentThreadId;

    // --- Explicit Session Creation Logic --- 
    if (targetThreadId === null) {
        setIsCreatingSession(true); // Start loading indicator
        console.log("No current thread ID. Attempting to create new session...");
        try {
            const newTitle = formatChatTitle(contentToSend);
            const newSession = await createChatSession(accountId, userId, newTitle);
            
            if (newSession && newSession.id) {
                targetThreadId = newSession.id;
                console.log("New session created successfully:", targetThreadId);
                setCurrentThreadId(targetThreadId); // Update internal state
                if (onSessionCreated) {
                    onSessionCreated(targetThreadId); // Notify parent immediately
                }
            } else {
                throw new Error("Failed to create chat session.");
            }
        } catch (err) {
            console.error("Error creating session in handleSendMessage:", err);
            // TODO: Show error to user?
            setIsCreatingSession(false); // Stop loading indicator on error
            return; // Prevent sending message if session creation fails
        } finally {
             setIsCreatingSession(false); // Stop loading indicator
        }
    }
    // --- End Explicit Session Creation Logic --- 
    
    if (!targetThreadId) {
        console.error("Cannot send message: targetThreadId is still null after creation attempt.");
        return;
    }

    // --- Construct Input with FULL History --- 
    // Get current raw messages from the hook state
    const currentRawMessages = thread.messages || [];
    // Create the new raw message in LangGraphMessage format
    const newRawHumanMessage: LangGraphMessage = { type: 'human', content: contentToSend };
    // Combine existing raw messages with the new one for the input payload
    const runInput = {
        messages: [...currentRawMessages, newRawHumanMessage],
    };
    // --- End Construct Input with FULL History ---
    
    const runConfig = {
      configurable: {
        user_id: userId,
        account_id: accountId
      },
      stream_mode: 'messages-tuple' 
    };

    console.log(`Submitting input via thread.submit to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
    try {
        thread.submit(runInput, { // Pass the input with full history
            config: runConfig,
            optimisticValues(prev) {
                // Optimistic update still just adds the single new message locally
                const prevMessages = prev.messages ?? [];
                const newMessage: LangGraphMessage = { 
                    type: 'human' as const, 
                    content: contentToSend,
                    id: `temp-${Date.now()}` 
                };
                return { ...prev, messages: [...prevMessages, newMessage] };
            },
        });

        onMessageSent?.(); 

    } catch (err) {
        console.error("Error calling thread.submit:", err);
    }

  }, [input, isProcessing, isInterrupting, thread, userId, accountId, currentThreadId, onSessionCreated, onMessageSent]);

  // Auto-adjust textarea height
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to recalculate based on content
      const scrollHeight = inputRef.current.scrollHeight;
      // Set a max height (e.g., corresponds to max-h-[200px])
      const maxHeight = 200;
      if (scrollHeight > maxHeight) {
        inputRef.current.style.height = `${maxHeight}px`;
        inputRef.current.style.overflowY = 'auto'; // Show scrollbar if max height reached
      } else {
        inputRef.current.style.height = `${scrollHeight}px`;
        inputRef.current.style.overflowY = 'hidden'; // Hide scrollbar if below max height
      }
    }
  }, [input]); // Re-run when input changes

  // Handle interrupt confirmation
  const handleInterruptConfirmation = useCallback((confirmationString: 'yes' | 'no') => { 
    console.log("Resuming interrupt with value:", confirmationString);
    if (!isInterrupting) return;
    
    // Pass context in config when resuming too
    const runConfig = {
      configurable: {
        user_id: userId,
        account_id: accountId
      },
      stream_mode: 'messages-tuple' // Use messages-tuple mode for proper filtering
    };

    try { 
      thread.submit(undefined, { 
        command: { resume: confirmationString },
        config: runConfig // Pass config on resume
      });
    } catch (err) { 
      console.error("Error calling thread.submit for resume:", err); 
    }
  }, [isInterrupting, thread, userId, accountId]); // Add userId and accountId

  // Auto-scroll: Only scroll down if user is near the bottom
  // useEffect(() => {
  //   const scrollElement = scrollContainerRef.current;
  //   if (scrollElement) {
  //     // Access the direct scrollable child (often the first child)
  //     const viewport = scrollElement.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  //     if (viewport) {
  //       const isScrolledToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100; // Threshold of 100px
  //       if (isScrolledToBottom) {
  //         messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  //       }
  //     }
  //   }
  // }, [messagesToDisplay]); // Keep dependency array the same

  // Focus input
  useEffect(() => {
    if (!isProcessing && !isInterrupting) {
    inputRef.current?.focus();
    }
  }, [isProcessing, isInterrupting]);

  // Update internal state when the session ID prop changes (e.g., new chat started or existing selected)
  useEffect(() => {
      console.log("Chat component received session/thread ID prop change:", initialSessionId);
      const newThreadId = initialSessionId ?? null;
      
      // Update state only if prop is different from current state
      if (newThreadId !== currentThreadId) {
          setCurrentThreadId(newThreadId);
          setInput(''); // Clear input when switching threads
          // Reset any potential creation state just in case
          setIsCreatingSession(false);
      }
      
  }, [initialSessionId, currentThreadId]); 

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
      
      <ScrollArea ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
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
        <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSendMessage(); }} className="flex items-end space-x-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            placeholder={isInterrupting ? "Confirm or deny above..." : "Ask about your portfolio..."}
            disabled={isProcessing || isInterrupting}
            className="flex-1 resize-none min-h-[40px] max-h-[200px]"
            rows={1}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey && !isProcessing && !isInterrupting) {
                e.preventDefault(); 
                handleSendMessage();
              }
            }}
          />
          {isProcessing && !thread.isLoading ? ( // Show stop only for stream loading, not session creation
              <Button type="button" size="icon" disabled={true} title="Creating session...">
                  <RefreshCcw size={18} className="animate-spin" /> 
              </Button>
          ) : isProcessing ? (
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