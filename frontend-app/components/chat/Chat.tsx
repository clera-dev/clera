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
import SuggestedQuestions from './SuggestedQuestions';

// Define the expected state type and interrupt type
type GraphStateType = { 
  messages: LangGraphMessage[]; 
};
// Define the expected type of the interrupt value if known, otherwise use unknown or string
type InterruptValueType = string; // Assuming the interrupt value is the prompt string

interface ChatProps {
  accountId: string;
  userId: string;
  onClose: () => void;
  isFullscreen?: boolean;
  sessionId?: string;
  initialMessages?: Message[];
  onMessageSent?: () => void;
  onQuerySent?: () => Promise<void>;
  isLimitReached: boolean;
  onSessionCreated?: (sessionId: string) => void;
  isSidebarMode?: boolean;
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
  sessionId: initialSessionId,
  initialMessages = [],
  onMessageSent,
  onQuerySent,
  isLimitReached,
  onSessionCreated,
  isSidebarMode = false,
}: ChatProps) {
  // State managed by useStream replaces manual message/loading state
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialSessionId || null);
  const [isCreatingSession, setIsCreatingSession] = useState(false); // Added loading state for session creation
  // State to hold the first message temporarily until threadId is set and acknowledged
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  
  // TODO: Get these from environment variables
  const apiUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;
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

  // --- Effect to handle submitting the *first* message ---
  useEffect(() => {
    // Check if we just set a new thread ID and have a pending message
    if (currentThreadId && pendingFirstMessage && !isProcessing) { // Ensure not already processing
      const contentToSend = pendingFirstMessage;
      console.log(`useEffect detected new threadId ${currentThreadId} and pending message "${contentToSend}". Submitting...`);
      setPendingFirstMessage(null); // Clear pending state immediately

      // Construct Input for the FIRST message
      // The backend graph should append this message to the new thread's state.
      const runInput = {
          messages: [{ type: 'human' as const, content: contentToSend }],
      };
      const runConfig = {
        configurable: { user_id: userId, account_id: accountId },
        stream_mode: 'messages-tuple' as const
      };

      console.log(`Submitting FIRST message via thread.submit to thread ${currentThreadId}:`, runInput, "with config:", runConfig);
      try {
          thread.submit(runInput, {
              config: runConfig,
              optimisticValues(prev) {
                  const prevMessages = prev.messages ?? [];
                  const newMessage: LangGraphMessage = {
                      type: 'human' as const,
                      content: contentToSend, // Use the captured contentToSend
                      id: `temp-${Date.now()}`
                  };
                  // Important: Optimistic update should reflect the state *after* this message
                  return { ...prev, messages: [...prevMessages, newMessage] };
              },
          });

          // Callbacks for the first message submission initiation
          onMessageSent?.();
           // Execute async onQuerySent without awaiting here to avoid blocking effect
          if (onQuerySent) {
            onQuerySent().catch(err => console.error("Error in onQuerySent for first message:", err));
          }

      } catch (err) {
          console.error("Error calling thread.submit for first message from useEffect:", err);
          // Potentially reset pending message or show error to user
          // setPendingFirstMessage(contentToSend); // Option: Retry? Or clear?
      }
    }
  }, [currentThreadId, pendingFirstMessage, thread, userId, accountId, onMessageSent, onQuerySent, isProcessing]); // Added isProcessing to dependencies
  // --- End Effect for first message ---

  // Handle input submission (for new sessions OR subsequent messages)
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

    // --- Handle Session Creation OR Subsequent Message ---
    if (targetThreadId === null) {
        // --- This is the FIRST message in a new chat ---
        setIsCreatingSession(true); // Start loading indicator for session creation
        console.log("No current thread ID. Attempting to create new session...");
        try {
            const newTitle = formatChatTitle(contentToSend);
            // Pass accountId and userId correctly
            const newSession = await createChatSession(accountId, userId, newTitle);

            if (newSession && newSession.id) {
                targetThreadId = newSession.id;
                console.log("New session created successfully:", targetThreadId);

                // 1. Set the pending message content
                setPendingFirstMessage(contentToSend);
                // 2. Update the thread ID state - this will trigger the useEffect
                setCurrentThreadId(targetThreadId);

                if (onSessionCreated) {
                    onSessionCreated(targetThreadId); // Notify parent immediately
                }
                // 3. DO NOT submit here - the useEffect will handle it once currentThreadId is set.
            } else {
                throw new Error("Failed to create chat session or received invalid response.");
            }
        } catch (err) {
            console.error("Error creating session in handleSendMessage:", err);
            // TODO: Show error to user?
            // Clear pending message if session creation fails?
             setPendingFirstMessage(null);
        } finally {
             setIsCreatingSession(false); // Stop loading indicator
        }
    } else {
        // --- This is a SUBSEQUENT message in an existing chat ---
        console.log(`Submitting SUBSEQUENT message to thread ${targetThreadId}`);

        // --- MODIFIED: Send only the new message for subsequent messages ---
        // LangGraph server maintains thread state, so we only need to send the new message
        const runInput = {
            messages: [{ type: 'human' as const, content: contentToSend }],
        };
        
        const runConfig = {
          configurable: {
            user_id: userId,
            account_id: accountId
          },
          stream_mode: 'messages-tuple' as const // Ensure consistent stream mode
        };

        console.log(`Submitting subsequent input via thread.submit to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        try {
            thread.submit(runInput, {
                config: runConfig,
                optimisticValues(prev) {
                    // Optimistic update still adds the single new message locally 
                    const prevMessages = prev.messages ?? [];
                    const newMessage: LangGraphMessage = {
                        type: 'human' as const,
                        content: contentToSend,
                        id: `temp-${Date.now()}`
                    };
                    return { ...prev, messages: [...prevMessages, newMessage] };
                },
            });

            // Callbacks after successful submission initiation for subsequent messages
            onMessageSent?.();
            await onQuerySent?.(); // Keep await here for subsequent messages

        } catch (err) {
            console.error("Error calling thread.submit for subsequent message:", err);
        }
    }

  }, [input, isProcessing, isInterrupting, thread, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent, formatChatTitle, createChatSession, setPendingFirstMessage, setCurrentThreadId, setIsCreatingSession]); // Added missing dependencies

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

  // Auto-scroll: Scroll to bottom when messages change
  useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (scrollElement && messagesEndRef.current) {
      // Check if user is near bottom (within 100px)
      const isNearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;
      
      // Auto-scroll if near bottom or if processing (new message being generated)
      if (isNearBottom || isProcessing) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messagesToDisplay, isProcessing]);

  // Focus input
  useEffect(() => {
    if (!isProcessing && !isInterrupting) {
    inputRef.current?.focus();
    }
  }, [isProcessing, isInterrupting]);

  // Listen for Clera Assist prompts
  useEffect(() => {
    const handleCleraAssistPrompt = (event: CustomEvent) => {
      const { prompt, context } = event.detail;
      if (prompt) {
        // Set the prompt as input
        setInput(prompt);
        // Use a ref to trigger submission after the input is set
        setTimeout(() => {
          // Trigger form submission programmatically
          const form = document.querySelector('form[data-chat-form="true"]') as HTMLFormElement;
          if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
          }
        }, 100);
      }
    };

    window.addEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    return () => {
      window.removeEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    };
  }, []);

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
          // Also clear any pending first message if the thread context changes
          setPendingFirstMessage(null);
      }
      
  }, [initialSessionId, currentThreadId]); 

  // Create a string representation of the error, or null if no error
  const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : null;

  // Add this function to handle selecting a suggested question
  const handleSuggestedQuestion = useCallback(async (question: string) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isProcessing || isInterrupting) return;

    // Clear the input field immediately
    setInput('');

    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.rows = 1;
    }

    let targetThreadId = currentThreadId;

    // Handle Session Creation OR Subsequent Message (same logic as handleSendMessage)
    if (targetThreadId === null) {
        // This is the FIRST message in a new chat
        setIsCreatingSession(true);
        console.log("No current thread ID. Attempting to create new session...");
        try {
            const newTitle = formatChatTitle(trimmedQuestion);
            const newSession = await createChatSession(accountId, userId, newTitle);

            if (newSession && newSession.id) {
                targetThreadId = newSession.id;
                console.log("New session created successfully:", targetThreadId);

                // Set the pending message content
                setPendingFirstMessage(trimmedQuestion);
                // Update the thread ID state - this will trigger the useEffect
                setCurrentThreadId(targetThreadId);

                if (onSessionCreated) {
                    onSessionCreated(targetThreadId);
                }
            } else {
                throw new Error("Failed to create chat session or received invalid response.");
            }
        } catch (err) {
            console.error("Error creating session in handleSuggestedQuestion:", err);
            setPendingFirstMessage(null);
        } finally {
             setIsCreatingSession(false);
        }
    } else {
        // This is a SUBSEQUENT message in an existing chat
        console.log(`Submitting SUBSEQUENT suggested question to thread ${targetThreadId}`);

        const runInput = {
            messages: [{ type: 'human' as const, content: trimmedQuestion }],
        };
        
        const runConfig = {
          configurable: {
            user_id: userId,
            account_id: accountId
          },
          stream_mode: 'messages-tuple' as const
        };

        console.log(`Submitting suggested question via thread.submit to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        try {
            thread.submit(runInput, {
                config: runConfig,
                optimisticValues(prev) {
                    const prevMessages = prev.messages ?? [];
                    const newMessage: LangGraphMessage = {
                        type: 'human' as const,
                        content: trimmedQuestion,
                        id: `temp-${Date.now()}`
                    };
                    return { ...prev, messages: [...prevMessages, newMessage] };
                },
            });

            // Callbacks after successful submission initiation
            onMessageSent?.();
            await onQuerySent?.();

        } catch (err) {
            console.error("Error calling thread.submit for suggested question:", err);
        }
    }
  }, [isProcessing, isInterrupting, thread, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent]);

  return (
    <div className="flex flex-col h-full">
      {!isFullscreen && !isSidebarMode && (
        <div className="flex-shrink-0 flex items-center justify-between p-2 border-b">
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
      
      {/* Messages Container - Native scroll like Vercel */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4"
      >
        {messagesToDisplay.map((msg: Message, index: number) => (
            <ChatMessage 
            key={`msg-${index}`}
            message={msg}
            isLast={index === messagesToDisplay.length - 1 && !isProcessing && !isInterrupting}
          />
        ))}
        
        {isInterrupting && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-center">
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
      </div>
      
      {/* Suggested Questions - Fixed position when no messages */}
      {messagesToDisplay.length === 0 && 
       !isProcessing && 
       !isInterrupting && 
       !currentThreadId && (
          <div className="flex-shrink-0 px-4 pb-4">
          <SuggestedQuestions onSelect={handleSuggestedQuestion} />
        </div>
      )}
      
      {/* Input Area - Fixed at bottom */}
      <div className="flex-shrink-0 border-t bg-background">
        {errorMessage && (
            <div className="text-red-500 text-sm py-1 px-3">Error: {errorMessage}</div>
        )}
        <div className="p-2">
        <form 
          onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSendMessage(); }} 
          className="flex items-end space-x-2"
          data-chat-form="true"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            placeholder={isInterrupting ? "Confirm or deny above..." : "Ask about your portfolio..."}
            disabled={isProcessing || isInterrupting}
              className="flex-1 resize-none min-h-[38px] max-h-[80px]"
            rows={1}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey && !isProcessing && !isInterrupting) {
                e.preventDefault(); 
                handleSendMessage();
              }
            }}
          />
          {isProcessing && !thread.isLoading ? (
              <Button 
                type="button" 
                size="icon" 
                disabled={true} 
                title="Creating session..."
              >
                  <RefreshCcw size={18} className="animate-spin" /> 
              </Button>
          ) : isProcessing ? (
            <Button 
              type="button" 
              variant="destructive" 
              size="icon" 
              onClick={() => thread.stop?.()} 
              title="Stop generation"
            >
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
    </div>
  );
} 