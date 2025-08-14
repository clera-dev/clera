"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '@/utils/api/chat-client';
import { useSecureChat } from '@/utils/api/secure-chat-client';
import { useMessageRetry } from '@/hooks/useMessageRetry';
import { 
  saveChatHistory, 
  loadChatHistory,
  formatChatTitle,
  updateChatThreadTitle,
  createChatSession,
  getThreadMessages
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SendIcon, XIcon, RefreshCcw, CheckIcon, BanIcon } from 'lucide-react';
import ChatMessage, { ChatMessageProps } from './ChatMessage';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import { InterruptConfirmation } from './InterruptConfirmation';
import ModelProviderRetryPopup from './ModelProviderRetryPopup';
import { TimelineRenderer } from './TimelineRenderer';
import { createTimelineBuilder, TimelineBuilder } from '@/utils/services/TimelineBuilder';

// Collapsible tool details per user message using modular architecture
function PerMessageToolDetails({
  runId,
  activities,
  isMobile,
  isFullscreen,
  isSidebarMode,
  timelineBuilder,
}: {
  runId: string;
  activities: any[];
  isMobile: boolean;
  isFullscreen: boolean;
  isSidebarMode?: boolean;
  timelineBuilder: TimelineBuilder;
}) {
  const [open, setOpen] = useState<boolean>(false);
  
  // Use TimelineBuilder to construct timeline steps
  const timelineSteps = timelineBuilder.buildTimelineForRun(activities, runId);
  
  if (timelineSteps.length === 0) return null;
  
  return (
    <div className="mt-3 mb-3">
      <button
        type="button"
        className="text-foreground text-sm hover:text-primary transition-colors inline-flex items-center gap-1 mb-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{open ? 'Hide details' : 'Show details'}</span>
        <span className={cn('transition-transform', open ? 'rotate-90' : '')}>›</span>
      </button>
      {open && (
        <TimelineRenderer 
          steps={timelineSteps}
          compact={isMobile || isSidebarMode}
          className="mt-2"
        />
      )}
    </div>
  );
}

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
  initialPrompt?: string;
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
  initialPrompt,
}: ChatProps) {
  // Use our secure chat client instead of direct LangGraph SDK
  const chatClient = useSecureChat();
  
  const [input, setInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialSessionId || null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);
  const [isFirstMessageSent, setIsFirstMessageSent] = useState(false); // New state to prevent duplicates
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const autoSubmissionTriggered = useRef(false); // Track if auto-submission has been triggered for this prompt
  
  // Mobile detection state
  const [isMobile, setIsMobile] = useState(false);
  
  // Memoize the first message flag reset callback to prevent unnecessary re-renders
  const onFirstMessageFlagReset = useCallback(() => setIsFirstMessageSent(false), []);

  // Initialize message retry hook to handle retry orchestration
  const messageRetry = useMessageRetry({
    userId,
    accountId,
    chatClient,
    onMessageSent,
    onQuerySent,
    onFirstMessageFlagReset,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineBuilderRef = useRef<TimelineBuilder>(createTimelineBuilder());

  // Derived state from secure chat client
  const isProcessing = chatClient.state.isLoading || isCreatingSession;
  const error = chatClient.state.error;
  const interrupt = chatClient.state.interrupt;
  const isInterrupting = interrupt !== null;
  const interruptMessage = interrupt?.value || null;
  const toolActivities = chatClient.state.toolActivities;
  const persistedRunIdsRef = useRef<string[] | null>(null);
  
  // Use retry popup state from the hook
  const shouldShowRetryPopup = messageRetry.shouldShowRetryPopup;

  // --- NEW: Single source of truth for messages ---
  // The chatClient's state will now be the primary message store.
  // We'll manage optimistic updates directly in the client.
  const messagesToDisplay = chatClient.state.messages;
  // Hydrate persisted tool activities for current thread on mount/switch
  useEffect(() => {
    (async () => {
      if (!currentThreadId) return;
      try {
        const params = new URLSearchParams({ thread_id: currentThreadId, account_id: accountId });
        const res = await fetch(`/api/conversations/get-tool-activities?${params.toString()}`, {
          method: 'GET'
        });
        if (!res.ok) return;
        const data = await res.json();
        const runs = Array.isArray(data.runs) ? data.runs : [];
        // Convert persisted runs into tool activity items in chronological order
        const persistedActivities = runs.flatMap((run: any) =>
          (run.tool_calls || []).map((t: any) => {
            // If the run itself is complete, all its activities should be marked complete
            // This prevents pulsing when revisiting completed threads
            const runIsComplete = run.status === 'complete' || run.ended_at;
            const activityStatus = runIsComplete ? 'complete' : (t.status === 'complete' ? 'complete' : 'running');
            
            return {
              id: `${run.run_id}-${t.tool_key}-${t.started_at}`,
              toolName: t.tool_label || t.tool_key,
              status: activityStatus,
              startedAt: new Date(t.started_at).getTime(),
              completedAt: t.completed_at ? new Date(t.completed_at).getTime() : undefined,
              // include runId to anchor rendering under the correct user message
              runId: run.run_id,
            };
          })
        );
        // Merge persisted activities with current ones (preserving new activities like "Thinking")
        const currentActivities = chatClient.state.toolActivities;
        const currentRunIds = new Set(currentActivities.map((a: any) => a.runId));
        
        // Only add persisted activities that don't conflict with current ones
        const newPersistedActivities = persistedActivities.filter((persisted: any) => 
          !currentRunIds.has(persisted.runId)
        );
        
        const mergedActivities = [...currentActivities, ...newPersistedActivities];
        chatClient.mergePersistedToolActivities(mergedActivities);

        // Store sorted runIds for assignment once messages are hydrated
        const sortedRuns = [...runs].sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
        persistedRunIdsRef.current = sortedRuns.map((r: any) => r.run_id);

        // Try to assign immediately if messages are already present
        tryAssignRunIdsToMessages();
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId, accountId]);

  // Assign runIds to messages as soon as both messages and runIds are available
  useEffect(() => {
    tryAssignRunIdsToMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesToDisplay]);

  function tryAssignRunIdsToMessages() {
    const runIds = persistedRunIdsRef.current;
    if (!runIds || runIds.length === 0) return;
    const current = [...chatClient.state.messages] as any[];
    if (current.length === 0) return;
    let changed = false;
    let idx = 0;
    for (let i = 0; i < current.length && idx < runIds.length; i++) {
      const m: any = current[i];
      if (m.role === 'user') {
        if (!m.runId) {
          m.runId = runIds[idx];
          changed = true;
        }
        idx++;
      }
    }
    if (changed) {
      chatClient.setMessages(current as any);
    }
  }

  // --- Effect to load initial/thread messages into the client's state ---
  useEffect(() => {
    const loadMessages = async () => {
      // CRITICAL FIX: Don't load messages if we're in new chat mode (initialSessionId is undefined)
      if (initialSessionId === undefined) {
        return;
      }
      
      if (currentThreadId) {
        try {
          // Fetch the existing messages for this thread
          const threadMessages = await getThreadMessages(currentThreadId);
          //console.log(`Loaded ${threadMessages.length} messages for thread ${currentThreadId}`);
          
          // CRITICAL FIX: Don't overwrite existing messages if we already have content
          // This prevents wiping out user messages + status when a new thread is created
          const currentMessages = chatClient.state.messages;
          if (threadMessages.length === 0 && currentMessages.length > 0) {
            //console.log(`Not overwriting ${currentMessages.length} existing messages with 0 thread messages`);
            return; // Keep existing messages (user input + status)
          }
          
          chatClient.setMessages(threadMessages);
          // PRODUCTION FIX: Clear any persistent errors when loading existing chat
          chatClient.clearErrorOnChatLoad();
        } catch (error) {
          console.error(`Failed to load messages for thread ${currentThreadId}:`, error);
          // Fall back to initial messages if thread loading fails
          chatClient.setMessages(initialMessages);
          // Also clear errors on fallback
          chatClient.clearErrorOnChatLoad();
        }
      } else {
        // If there's no thread, initialize the client with any initial messages.
        chatClient.setMessages(initialMessages);
      }
    };

    loadMessages();
    // The chatClient instance is stable and does not need to be a dependency.
    // Including it can cause re-renders when the client's internal state changes,
    // leading to potential infinite loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId, initialMessages, chatClient.setMessages, initialSessionId]);

  // Mobile detection effect
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Standard mobile breakpoint
    };
    
    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ARCHITECTURE FIX: Set up long processing callback - proper separation of concerns
  useEffect(() => {
    chatClient.setLongProcessingCallback(() => {
      // UI layer handles the presentation - create appropriate status message
      const currentMessages = [...chatClient.state.messages];
      const nonStatusMessages = currentMessages.filter(msg => !msg.isStatus);
      const longProcessingMessage = {
        role: 'assistant' as const,
        content: 'Processing complex request... This may take up to 2 minutes.',
        isStatus: true
      };
      chatClient.setMessages([...nonStatusMessages, longProcessingMessage]);
    });

    // MEMORY LEAK FIX: Clear callback on component unmount to prevent setState on unmounted component
    return () => {
      chatClient.clearLongProcessingCallback();
    };
  }, [chatClient]);

  // --- Effect to handle submitting the *first* message ---
  useEffect(() => {
    // Check if we just set a new thread ID, have a pending message, and haven't sent it yet
    if (currentThreadId && pendingFirstMessage && !isProcessing && !isFirstMessageSent) {
      //console.log(`useEffect detected new threadId ${currentThreadId} and pending message "${contentToSend}". Submitting...`);
      setPendingFirstMessage(null);

      // NEW: Store message content for potential retry before attempting to send
      messageRetry.prepareForSend(pendingFirstMessage, currentThreadId);

      // Submit message through secure client
      const runInput = {
        messages: [{ type: 'human' as const, content: pendingFirstMessage }],
      };
      
      const runConfig = {
        configurable: {
          user_id: userId,
          account_id: accountId
        },
        stream_mode: 'messages-tuple' as const
      };

      //console.log(`Submitting FIRST message via secure client to new thread ${currentThreadId}:`, runInput, "with config:", runConfig);
      
      chatClient.startStream(currentThreadId, runInput, userId, accountId).then(async () => {
        // NOTE: Don't clear retry state here - stream just started, not completed
        // Retry state will be cleared when we receive successful response or on next successful send
        
        // Callbacks for the first message submission
        onMessageSent?.();
        
        // CRITICAL FIX: Properly await and handle onQuerySent promise to prevent unhandled rejections
        if (onQuerySent) {
          try {
            await onQuerySent();
          } catch (err) {
            console.error("Error in onQuerySent for first message:", err);
            // Don't throw - this is a non-critical callback that shouldn't break the chat flow
          }
        }
        
        setIsFirstMessageSent(true); // Mark as sent to prevent re-sending
      }).catch((error: any) => {
        console.error("Error submitting first message:", error);
        // This prevents the user from being stuck if the first message fails.
        setIsFirstMessageSent(false);
        // Keep retry state for potential retry (don't clear lastFailedMessage)
      });
    }
  }, [currentThreadId, pendingFirstMessage, chatClient, userId, accountId, onMessageSent, onQuerySent, isProcessing, isFirstMessageSent]); // Remove messageRetry.prepareForSend to prevent unnecessary re-triggers
  // --- End Effect for first message ---

  // Handle input submission (for new sessions OR subsequent messages)
  // Accept an optional content override to avoid racing on state updates (e.g., auto-submit flows)
  const handleSendMessage = useCallback(async (contentOverride?: string): Promise<boolean> => {
    const sourceContent = typeof contentOverride === 'string' ? contentOverride : input;
    const trimmedInput = sourceContent.trim();
    if (!trimmedInput || isProcessing || isInterrupting) return false;

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
        //console.log("No current thread ID. Attempting to create new session...");
        try {
            const newTitle = formatChatTitle(contentToSend);
            // Pass accountId and userId correctly
            const newSession = await createChatSession(accountId, userId, newTitle);

            if (newSession && newSession.id) {
                targetThreadId = newSession.id;
                //console.log("New session created successfully:", targetThreadId);

                // 1. Set the pending message content
                setPendingFirstMessage(contentToSend);
                // 2. Update the thread ID state - this will trigger the useEffect
                setCurrentThreadId(targetThreadId);

                if (onSessionCreated) {
                    onSessionCreated(targetThreadId); // Notify parent immediately
                }
                // 3. DO NOT submit here - the useEffect will handle it once currentThreadId is set.
                return true;
            } else {
                throw new Error("Failed to create chat session or received invalid response.");
            }
        } catch (err) {
            console.error("Error creating session in handleSendMessage:", err);
            // TODO: Show error to user?
            // Clear pending message if session creation fails?
             setPendingFirstMessage(null);
             return false;
        } finally {
             setIsCreatingSession(false); // Stop loading indicator
        }
    } else {
        // --- This is a SUBSEQUENT message in an existing chat ---
        //console.log(`Submitting SUBSEQUENT message to thread ${targetThreadId}`);

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
          stream_mode: 'messages-tuple' as const
        };

        //console.log(`Submitting subsequent input via secure client to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        
        // NEW: Store message content for potential retry before attempting to send
        messageRetry.prepareForSend(contentToSend, targetThreadId);
        
        try {
            await chatClient.startStream(targetThreadId, runInput, userId, accountId);

            // NOTE: Don't clear retry state here - stream just started, not completed
            // Retry state will be cleared when we receive successful response or on next successful send

            // Callbacks after successful submission initiation for subsequent messages
            onMessageSent?.();
            
            // CRITICAL FIX: Properly await and handle onQuerySent promise to prevent unhandled rejections
            if (onQuerySent) {
              try {
                await onQuerySent();
              } catch (err) {
                console.error("Error in onQuerySent for subsequent message:", err);
                // Don't throw - this is a non-critical callback that shouldn't break the chat flow
              }
            }

        } catch (err) {
            console.error("Error submitting subsequent message:", err);
            // Keep retry state for potential retry (don't clear lastFailedMessage)
            return false;
        }
    }
    return true;

  }, [input, isProcessing, isInterrupting, chatClient, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent, formatChatTitle, createChatSession, setPendingFirstMessage, setCurrentThreadId, setIsCreatingSession]); // Remove messageRetry.prepareForSend

  // Handle suggested question selection
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
        //console.log("No current thread ID. Attempting to create new session...");
        try {
            const newTitle = formatChatTitle(trimmedQuestion);
            const newSession = await createChatSession(accountId, userId, newTitle);

            if (newSession && newSession.id) {
                targetThreadId = newSession.id;
                //console.log("New session created successfully:", targetThreadId);

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
        //console.log(`Submitting SUBSEQUENT suggested question to thread ${targetThreadId}`);

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

        // console.log(`Submitting suggested question via secure client to thread ${targetThreadId}:`, runInput, "with config:", runConfig);
        
        // NEW: Store message content for potential retry before attempting to send
        messageRetry.prepareForSend(trimmedQuestion, targetThreadId);
        
        try {
            await chatClient.startStream(targetThreadId, runInput, userId, accountId);

            // NOTE: Don't clear retry state here - stream just started, not completed
            // Retry state will be cleared when we receive successful response or on next successful send

            // Callbacks after successful submission initiation
            onMessageSent?.();
            
            // CRITICAL FIX: Properly await and handle onQuerySent promise to prevent unhandled rejections
            if (onQuerySent) {
              try {
                await onQuerySent();
              } catch (err) {
                console.error("Error in onQuerySent for suggested question:", err);
                // Don't throw - this is a non-critical callback that shouldn't break the chat flow
              }
            }

        } catch (err) {
            console.error("Error submitting suggested question:", err);
            // Keep retry state for potential retry (don't clear lastFailedMessage)
        }
    }
  }, [isProcessing, isInterrupting, chatClient, userId, accountId, currentThreadId, onSessionCreated, onMessageSent, onQuerySent, formatChatTitle, createChatSession, setPendingFirstMessage, setCurrentThreadId, setIsCreatingSession]); // Remove messageRetry.prepareForSend

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
    //console.log("Resuming interrupt with value:", confirmationString);
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

  // Handle auto-submission of initial prompt
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && !isFirstMessageSent && accountId && userId && !autoSubmissionTriggered.current) {
      const submitTimer = setTimeout(async () => {
        if (!isProcessing && !isInterrupting && accountId && userId) {
          try {
            autoSubmissionTriggered.current = true; // set right before attempting
            setInput(initialPrompt);
            const ok = await handleSendMessage(initialPrompt);
            if (!ok) {
              autoSubmissionTriggered.current = false; // allow retry on failure
            }
          } catch (e) {
            autoSubmissionTriggered.current = false; // allow retry if exception
          }
        } else {
          // Reset to allow a later retry when ready
          autoSubmissionTriggered.current = false;
        }
      }, 500);
      return () => clearTimeout(submitTimer);
    }
  }, [initialPrompt, isFirstMessageSent, handleSendMessage, accountId, userId, isProcessing, isInterrupting]);

  // Listen for Clera Assist prompts (fallback for runtime events)
  useEffect(() => {
    const handleCleraAssistPrompt = (event: CustomEvent) => {
      const { prompt, context } = event.detail;
      if (prompt && prompt.trim() && accountId && userId) {
        // Skip if this is the same prompt as initialPrompt (already handled by primary useEffect)
        if (initialPrompt && prompt === initialPrompt) {
          return;
        }
        
        // Set the prompt as input and submit using the value directly
        setInput(prompt);
        setTimeout(() => {
          if (!isProcessing && !isInterrupting && accountId && userId) {
            handleSendMessage(prompt);
            // Don't set isFirstMessageSent here - let the session creation flow handle it
          }
        }, 200);
      }
    };

    window.addEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    return () => {
      window.removeEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    };
  }, [isProcessing, isInterrupting, handleSendMessage, accountId, userId, initialPrompt]);

  // Update internal state when the session ID prop changes (e.g., new chat started or existing selected)
  useEffect(() => {
      //console.log("Chat component received session/thread ID prop change:", initialSessionId);
      const newThreadId = initialSessionId ?? null;
      
      // CRITICAL FIX: If initialSessionId is undefined (New Chat), immediately clear everything
      if (initialSessionId === undefined) {
        // console.log("New Chat detected - clearing all chat state immediately");
        setCurrentThreadId(null);
        // Don't clear input if we have an initial prompt (Clera Assist)
        if (!initialPrompt) {
          setInput('');
        }
        setIsCreatingSession(false);
        setPendingFirstMessage(null);
        setIsFirstMessageSent(false);
        autoSubmissionTriggered.current = false; // Reset auto-submission flag for new chat
        chatClient.setMessages([]); // Clear messages immediately
        return; // Don't proceed with normal logic
      }
      
      // Update state only if prop is different from current state
      if (newThreadId !== currentThreadId) {
          //console.log(`Switching to thread: ${newThreadId} from ${currentThreadId}`);
          setCurrentThreadId(newThreadId);
          setInput(''); // Clear input when switching threads
          setIsCreatingSession(false);
          setPendingFirstMessage(null);
          setIsFirstMessageSent(false);
          autoSubmissionTriggered.current = false; // Reset auto-submission flag when switching threads
          
          // PRODUCTION FIX: Clear messages synchronously, let useEffect handle loading
          // This is deterministic and doesn't rely on timing
          chatClient.setMessages([]);
      }
      
  }, [initialSessionId, currentThreadId, chatClient, initialPrompt]); 

  // Create a string representation of the error, or null if no error
  const errorMessage = error ? String(error) : null;

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
        className={cn(
          "flex-1 overflow-y-auto min-h-0",
          // Spacing between messages and container padding
          isMobile && isFullscreen 
            ? "space-y-4 px-3 py-4" // Mobile: compact
            : isSidebarMode 
            ? "space-y-4 px-3 py-4" // Sidebar: compact
            : "space-y-8 px-8 py-6" // Desktop full-screen: generous spacing
        )}
      >
        {(() => {
          // Ensure tool activity list appears below the blue status bubble and above the final assistant response
          const msgs = messagesToDisplay;
          const lastIndex = msgs.length - 1;
          const lastMsg = msgs[lastIndex];
          const isFinalAssistant = lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStatus;
          const preFinal = isFinalAssistant ? msgs.slice(0, lastIndex) : msgs;
          const finalOnly = isFinalAssistant ? [lastMsg] : [];

          const renderedRunIds = new Set<string>();
          return (
            <>
              {preFinal.map((msg: Message, index: number) => {
                // Get runId from the message itself (status messages and assistant responses now both have runIds)
                // Fall back to finding the previous user message if needed
                const prevUserRunId = (msg as any).runId || 
                  [...preFinal.slice(0, index)].reverse().find(m => m.role === 'user' && (m as any).runId)?.['runId' as keyof Message] as any;
                const detailsBlock = (placeAfter: boolean) => (
                  prevUserRunId && !renderedRunIds.has(prevUserRunId as string) && (toolActivities as any[]).some(a => a.runId === prevUserRunId)
                    ? (
                      <PerMessageToolDetails
                        runId={prevUserRunId as any}
                        activities={toolActivities as any}
                        isMobile={isMobile}
                        isFullscreen={isFullscreen}
                        isSidebarMode={isSidebarMode}
                        timelineBuilder={timelineBuilderRef.current}
                      />
                    )
                    : null
                );

                // For assistant final messages (non-status) that already exist in preFinal, render details just above them
                if (msg.role === 'assistant' && !(msg as any).isStatus) {
                  const details = detailsBlock(false);
                  if (details && prevUserRunId) {
                    renderedRunIds.add(prevUserRunId as string);
                  }
                  return (
                    <div key={msg.id || `msg-${index}`}>
                      {details}
                      <ChatMessage
                        message={msg}
                        isLast={index === preFinal.length - 1}
                        isMobileMode={isMobile && isFullscreen}
                        isSidebarMode={isSidebarMode}
                      />
                    </div>
                  );
                }

                // For status messages, render details below the blue bubble while the run is in progress
                if ((msg as any).isStatus) {
                  const details = detailsBlock(true);
                  if (details && prevUserRunId) {
                    renderedRunIds.add(prevUserRunId as string);
                  }
                  return (
                    <div key={msg.id || `msg-${index}`}>
                      <ChatMessage
                        message={msg}
                        isLast={index === preFinal.length - 1}
                        isMobileMode={isMobile && isFullscreen}
                        isSidebarMode={isSidebarMode}
                      />
                      {details}
                    </div>
                  );
                }

                // Default: render plain message
                return (
                  <ChatMessage
                    key={msg.id || `msg-${index}`}
                    message={msg}
                    isLast={index === preFinal.length - 1}
                    isMobileMode={isMobile && isFullscreen}
                    isSidebarMode={isSidebarMode}
                  />
                );
              })}

              {finalOnly.map((msg: Message, index: number) => (
                (() => {
                  const runId = (msg as any).runId || [...preFinal].reverse().find(m => m.role === 'user' && (m as any).runId)?.['runId' as keyof Message];
                  const shouldRenderDetails = runId && !renderedRunIds.has(runId as string) && (toolActivities as any[]).some(a => a.runId === runId);
                  if (shouldRenderDetails) renderedRunIds.add(runId as string);
                  return (
                    <div key={msg.id || `final-${index}`}> 
                      {shouldRenderDetails && (
                        <PerMessageToolDetails
                          runId={runId as any}
                          activities={toolActivities as any}
                          isMobile={isMobile}
                          isFullscreen={isFullscreen}
                          isSidebarMode={isSidebarMode}
                          timelineBuilder={timelineBuilderRef.current}
                        />
                      )}
                      <ChatMessage
                        message={msg}
                        isLast={true}
                        isMobileMode={isMobile && isFullscreen}
                        isSidebarMode={isSidebarMode}
                      />
                    </div>
                  );
                })()
              ))}
            </>
          );
        })()}

        
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
      
      {/* Suggested Questions - Responsive positioning when no messages */}
      {messagesToDisplay.length === 0 && 
       !isProcessing && 
       !isInterrupting && 
       !currentThreadId && (
          <div className={cn(
            "flex-shrink-0",
            // Mobile: minimal padding to maximize input space
            isMobile && isFullscreen 
              ? "px-2 pb-2" 
              : "px-4 pb-4"
          )}>
          <SuggestedQuestions onSelect={handleSuggestedQuestion} />
        </div>
      )}
      
      {/* Input Area - Fixed at bottom */}
      <div className="flex-shrink-0 border-t bg-background">
        {/* NEW: Model Provider Retry Popup - Above input area */}
        {shouldShowRetryPopup && (
          <div className="p-4 border-b border-gray-100">
            <ModelProviderRetryPopup
              isVisible={shouldShowRetryPopup}
              onRetry={messageRetry.handleRetry}
              onDismiss={messageRetry.handleDismissRetry}
            />
          </div>
        )}
        
        {errorMessage && (
            <div className="text-red-500 text-sm py-1 px-3">Error: {errorMessage}</div>
        )}
        <div className={cn(
          isMobile && isFullscreen ? "p-1.5" : "p-2" // Thinner padding for mobile
        )}>
        <form 
          onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSendMessage(); }} 
          className="relative"
          data-chat-form="true"
        >
          {/* Input container with button inside */}
          <div className="relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              placeholder={isInterrupting ? "Confirm or deny above..." : "Ask about your portfolio..."}
              disabled={isProcessing || isInterrupting}
              className={cn(
                "resize-none max-h-[120px] w-full",
                // Height, text size, and padding based on context
                isMobile && isFullscreen 
                  ? "min-h-[44px] text-base pr-12 pl-3" // Mobile: thinner input, space for button
                  : isSidebarMode 
                  ? "min-h-[48px] text-sm pr-12 pl-3" // Sidebar: compact, space for button
                  : "min-h-[57px] text-base pr-14 pl-4" // Desktop: standard, more space for button
              )}
              rows={isMobile && isFullscreen ? 1 : 2}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey && !isProcessing && !isInterrupting) {
                  e.preventDefault(); 
                  handleSendMessage();
                }
              }}
            />
            
            {/* Send button positioned inside input */}
            <div className={cn(
              "absolute right-2 flex items-center",
              // Vertical positioning based on input height
              isMobile && isFullscreen 
                ? "top-2" // Mobile: center in thinner input
                : isSidebarMode 
                ? "top-2.5" // Sidebar: center in compact input
                : "top-3" // Desktop: center in standard input
            )}>
              {isProcessing && !chatClient.state.isLoading ? (
                <Button 
                  type="button" 
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-full p-0"
                  disabled={true} 
                  title="Creating session..."
                >
                  <RefreshCcw size={16} className="animate-spin" /> 
                </Button>
              ) : isProcessing ? (
                <Button 
                  type="button" 
                  variant="destructive" 
                  size="sm"
                  className="h-8 w-8 rounded-full p-0"
                  onClick={() => {
                    // Stop current operation by clearing client state
                    chatClient.clearError();
                  }} 
                  title="Stop generation"
                >
                  <XIcon size={16} />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  size="sm"
                  className={cn(
                    "h-8 w-8 rounded-full p-0 transition-all duration-200",
                    // Conditional styling based on input state
                    input.trim() && !isProcessing && !isInterrupting
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground" // Active state
                      : "bg-muted hover:bg-muted/80 text-muted-foreground cursor-not-allowed" // Disabled state
                  )}
                  disabled={!input.trim() || isProcessing || isInterrupting}
                >
                  <SendIcon size={16} />
                </Button>
              )}
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
} 