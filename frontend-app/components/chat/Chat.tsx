"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@/utils/api/chat-client';
import { useSecureChat } from '@/utils/api/secure-chat-client';
import { 
  saveChatHistory, 
  loadChatHistory,
  formatChatTitle,
  updateChatThreadTitle,
  createChatSession,
  getThreadMessages
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SendIcon, XIcon, RefreshCcw, CheckIcon, BanIcon } from 'lucide-react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import { InterruptConfirmation } from './InterruptConfirmation';
// ChatSkeleton removed - status messages now provide proper feedback
import SuggestedQuestions from './SuggestedQuestions';

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
  // Use our secure chat client instead of direct LangGraph SDK
  const chatClient = useSecureChat();
  
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialSessionId || null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const [isFirstMessageSent, setIsFirstMessageSent] = useState(false); // New state to prevent duplicates
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Derived state from secure chat client
  const isProcessing = chatClient.state.isLoading || isCreatingSession;
  const error = chatClient.state.error;
  const interrupt = chatClient.state.interrupt;
  const isInterrupting = interrupt !== null;
  const interruptMessage = interrupt?.value || null;

  // --- NEW: Single source of truth for messages ---
  // The chatClient's state will now be the primary message store.
  // We'll manage optimistic updates directly in the client.
  const messagesToDisplay = chatClient.state.messages;

  // --- Effect to load initial/thread messages into the client's state ---
  useEffect(() => {
    const loadMessages = async () => {
      // CRITICAL FIX: Don't load messages if we're in new chat mode (initialSessionId is undefined)
      if (initialSessionId === undefined) {
        console.log(`Skipping message loading - in new chat mode`);
        return;
      }
      
      if (currentThreadId) {
        console.log(`Loading messages for thread: ${currentThreadId}`);
        try {
          // Fetch the existing messages for this thread
          const threadMessages = await getThreadMessages(currentThreadId);
          console.log(`Loaded ${threadMessages.length} messages for thread ${currentThreadId}`);
          
          // CRITICAL FIX: Don't overwrite existing messages if we already have content
          // This prevents wiping out user messages + status when a new thread is created
          const currentMessages = chatClient.state.messages;
          if (threadMessages.length === 0 && currentMessages.length > 0) {
            console.log(`Not overwriting ${currentMessages.length} existing messages with 0 thread messages`);
            return; // Keep existing messages (user input + status)
          }
          
          chatClient.setMessages(threadMessages);
        } catch (error) {
          console.error(`Failed to load messages for thread ${currentThreadId}:`, error);
          // Fall back to initial messages if thread loading fails
          chatClient.setMessages(initialMessages);
        }
      } else {
        // If there's no thread, initialize the client with any initial messages.
        chatClient.setMessages(initialMessages);
      }
    };

    loadMessages();
  }, [currentThreadId, initialMessages, chatClient, initialSessionId]);


  // --- Effect to handle submitting the *first* message ---
  useEffect(() => {
    // Check if we just set a new thread ID, have a pending message, and haven't sent it yet
    if (currentThreadId && pendingFirstMessage && !isProcessing && !isFirstMessageSent) {
      setIsFirstMessageSent(true); // Set flag to prevent re-sending
      const contentToSend = pendingFirstMessage;
      console.log(`useEffect detected new threadId ${currentThreadId} and pending message "${contentToSend}". Submitting...`);
      setPendingFirstMessage(null);

      // Submit message through secure client
      const runInput = {
        messages: [{ type: 'human' as const, content: contentToSend }],
      };

      console.log(`Submitting FIRST message via secure client to thread ${currentThreadId}`);
      
      chatClient.startStream(currentThreadId, runInput, userId, accountId).then(() => {
        // Callbacks for the first message submission
        onMessageSent?.();
        if (onQuerySent) {
          onQuerySent().catch(err => console.error("Error in onQuerySent for first message:", err));
        }
      }).catch(err => {
        console.error("Error submitting first message:", err);
      });
    }
  }, [currentThreadId, pendingFirstMessage, chatClient, userId, accountId, onMessageSent, onQuerySent, isProcessing, isFirstMessageSent]); // Add isFirstMessageSent to dependency array
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

    // Add user message and status immediately - BEFORE any async operations
    const userMessage: Message = {
      role: 'user',
      content: contentToSend
    };
    chatClient.addMessagesWithStatus(userMessage);

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

        console.log(`Submitting subsequent input via secure client to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        
        try {
            await chatClient.startStream(targetThreadId, runInput, userId, accountId);

            // Callbacks after successful submission initiation for subsequent messages
            onMessageSent?.();
            await onQuerySent?.(); // Keep await here for subsequent messages

        } catch (err) {
            console.error("Error submitting subsequent message:", err);
        }
    }

  }, [input, isProcessing, isInterrupting, chatClient, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent, formatChatTitle, createChatSession, setPendingFirstMessage, setCurrentThreadId, setIsCreatingSession]);

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
  const handleInterruptConfirmation = useCallback(async (confirmationString: 'yes' | 'no') => { 
    console.log("Resuming interrupt with value:", confirmationString);
    if (!isInterrupting) return;

    try { 
      if (interrupt?.runId && currentThreadId) {
        await chatClient.handleInterrupt(currentThreadId, interrupt.runId, confirmationString);
      }
    } catch (err) { 
      console.error("Error handling interrupt:", err); 
    }
  }, [isInterrupting, chatClient, userId, accountId, interrupt, currentThreadId]); // Add userId and accountId

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
      
      // CRITICAL FIX: If initialSessionId is undefined (New Chat), immediately clear everything
      if (initialSessionId === undefined) {
        console.log("New Chat detected - clearing all chat state immediately");
        setCurrentThreadId(null);
        setInput('');
        setIsCreatingSession(false);
        setPendingFirstMessage(null);
        setIsFirstMessageSent(false);
        chatClient.setMessages([]); // Clear messages immediately
        return; // Don't proceed with normal logic
      }
      
      // Update state only if prop is different from current state
      if (newThreadId !== currentThreadId) {
          console.log(`Switching to thread: ${newThreadId} from ${currentThreadId}`);
          setCurrentThreadId(newThreadId);
          setInput(''); // Clear input when switching threads
          setIsCreatingSession(false);
          setPendingFirstMessage(null);
          setIsFirstMessageSent(false);
          
          // PRODUCTION FIX: Clear messages synchronously, let useEffect handle loading
          // This is deterministic and doesn't rely on timing
          chatClient.setMessages([]);
      }
      
  }, [initialSessionId, currentThreadId, chatClient]); 

  // Create a string representation of the error, or null if no error
  const errorMessage = error ? String(error) : null;

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

    // Add user message and status immediately - BEFORE any async operations
    const userMessage: Message = {
      role: 'user',
      content: trimmedQuestion
    };
    chatClient.addMessagesWithStatus(userMessage);

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

        console.log(`Submitting suggested question via secure client to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        
        try {
            await chatClient.startStream(targetThreadId, runInput, userId, accountId);

            // Callbacks after successful submission initiation
            onMessageSent?.();
            await onQuerySent?.();

        } catch (err) {
            console.error("Error submitting suggested question:", err);
        }
    }
  }, [isProcessing, isInterrupting, chatClient, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent]);

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
            key={msg.id || `msg-${index}`}
            message={msg}
            isLast={index === messagesToDisplay.length - 1}
          />
        ))}
        
        {isInterrupting && interrupt && (
          <InterruptConfirmation
            interrupt={interrupt}
            onConfirm={(response: boolean) => handleInterruptConfirmation(response ? 'yes' : 'no')}
            isLoading={isProcessing}
          />
        )}
        
        {/* ChatSkeleton removed - status messages now provide proper feedback */}
        
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
          {isProcessing && !chatClient.state.isLoading ? (
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
              onClick={() => {
                // Stop current operation by clearing client state
                chatClient.clearError();
              }} 
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