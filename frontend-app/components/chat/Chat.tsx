"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  Message, 
  sendChatRequest, 
  saveChatHistory, 
  loadChatHistory,
  getConversationHistory,
  conversationsToMessages,
  resumeChatRequest,
  ChatApiResponse,
  InterruptResponse,
  ChatResponse
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SendIcon, XIcon, RefreshCcw, CheckIcon, BanIcon } from 'lucide-react';
import ChatMessage from './ChatMessage';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import ChatSkeleton from './ChatSkeleton';

interface ChatProps {
  accountId: string;
  userId?: string;
  onClose: () => void;
  isFullscreen?: boolean;
  sessionId?: string;
  initialMessages?: Message[];
  onMessageSent?: () => void;
  onSessionCreated?: (sessionId: string) => void;
}

export default function Chat({ 
  accountId, 
  userId,
  onClose, 
  isFullscreen = false,
  sessionId: initialSessionId,
  initialMessages = [],
  onMessageSent,
  onSessionCreated
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localUserId, setLocalUserId] = useState<string | undefined>(userId);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(initialSessionId);

  // State for Interrupt Handling
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [interruptMessage, setInterruptMessage] = useState('');
  const [interruptSessionId, setInterruptSessionId] = useState<string | null>(null);

  // Load user ID from props or localStorage if needed
  useEffect(() => {
    if (!localUserId) {
      try {
        const storedUserId = localStorage.getItem('userId');
        if (storedUserId) {
          setLocalUserId(storedUserId);
        } else {
          console.error("No user ID found in props or localStorage");
        }
      } catch (error) {
        console.error('Error accessing localStorage for userId:', error);
      }
    }
  }, [localUserId]);

  // Effect to update currentSessionId when prop changes
  useEffect(() => {
    setCurrentSessionId(initialSessionId);
  }, [initialSessionId]);

  // Load conversation history on mount or when currentSessionId changes
  useEffect(() => {
    const loadUserDataAndHistory = async () => {
      setIsLoadingHistory(true);
      try {
        // If initial messages were provided, use them instead of loading
        if (initialMessages.length > 0) {
          setMessages(initialMessages);
          setIsLoadingHistory(false);
          return;
        }

        // If currentSessionId is provided, load that specific conversation
        if (currentSessionId) {
          try {
            const response = await fetch(`/api/conversations/session/${currentSessionId}`);
            if (response.ok) {
              const data = await response.json();
              
              // Check if backend returned messages
              if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                setMessages(data.messages);
                console.log(`Loaded ${data.messages.length} messages for session ${currentSessionId}`);
              } else {
                // If no messages found for session, start with welcome message
                console.log(`No messages found for session ${currentSessionId}, starting fresh.`);
                setMessages([
                  {
                    role: 'assistant',
                    content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
                  }
                ]);
              }
            } else {
              // Handle API errors gracefully
              console.error(`Error loading session ${currentSessionId}: Status ${response.status}`);
              setMessages([
                {
                  role: 'assistant',
                  content: "Sorry, I couldn't load this conversation. Let's start fresh!"
                }
              ]);
            }
            setIsLoadingHistory(false);
            return;
          } catch (error) {
            console.error(`Error loading session ${currentSessionId}:`, error);
            setMessages([
              {
                role: 'assistant',
                content: "Sorry, I couldn't load this conversation. Let's start fresh!"
              }
            ]);
            setIsLoadingHistory(false);
            return;
          }
        }

        // Fallback if no currentSessionId or initialMessages: Add welcome message
        console.log("No session ID or initial messages, starting with welcome message.");
        setMessages([
          {
            role: 'assistant',
            content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
          }
        ]);
      } catch (error) {
        console.error('Error loading chat history:', error);
        // Generic error handling
        setMessages([
          {
            role: 'assistant',
            content: "Sorry, I encountered an error. Let's start fresh!"
          }
        ]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    // Only load if we have an account ID
    if (accountId) {
      loadUserDataAndHistory();
    } else {
      // If no account ID yet, show loading or placeholder
      setIsLoadingHistory(true); // Keep showing loading until accountId is available
    }
  }, [accountId, currentSessionId, initialMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Save chat history to localStorage as backup when messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Don't submit if interrupting
    if (!input.trim() || isLoading || isInterrupting) return;
    
    // Add user message
    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    const currentInput = input; // Store input before clearing
    setInput('');
    setIsLoading(true);
    
    try {
      // Send request to backend with both accountId and userId
      const response: ChatApiResponse = await sendChatRequest(
        updatedMessages, 
        currentInput, // Use stored input
        accountId, 
        localUserId, 
        currentSessionId // Use current session ID
      );

      // Handle Interrupt Response
      if (response.type === 'interrupt') {
        console.log("Chat interrupted, waiting for confirmation.");
        setInterruptMessage(response.message);
        setInterruptSessionId(response.session_id);
        setIsInterrupting(true);
        setIsLoading(false); // Stop loading indicator for interrupt
        
        // Update session ID if it changed during interrupt
        if (response.session_id && response.session_id !== currentSessionId) {
          setCurrentSessionId(response.session_id);
          if (onSessionCreated) {
            onSessionCreated(response.session_id);
          }
        }
        return; // Stop processing here for interrupt
      }

      // Handle Regular Response
      const regularResponse = response as ChatResponse; // Type assertion
      
      // Update currentSessionId if the backend created/returned one
      if (regularResponse.session_id && regularResponse.session_id !== currentSessionId) {
        setCurrentSessionId(regularResponse.session_id);
        if (onSessionCreated) {
          onSessionCreated(regularResponse.session_id);
        }
      }
      
      // Add assistant response
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: regularResponse.response }
      ]);

      // Notify parent component that message was sent successfully
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (error) {
      console.error('Failed to get response:', error);
      // Add error message
      setMessages([
        ...updatedMessages,
        { 
          role: 'assistant', 
          content: `I'm sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]);
    } finally {
      // Only set loading false if not interrupting
      if (!isInterrupting) {
        setIsLoading(false);
      }
    }
  };

  // Function to handle interrupt confirmation
  const handleInterruptResponse = async (confirmation: 'yes' | 'no') => {
    if (!interruptSessionId || isLoading) return;

    setIsLoading(true); // Show loading while resuming
    setIsInterrupting(false); // Hide confirmation prompt
    setInterruptMessage('');

    // Add the confirmation as a user message for context (optional)
    // setMessages(prev => [...prev, { role: 'user', content: confirmation }]);

    try {
      // Call the resume function
      const finalResponse = await resumeChatRequest(interruptSessionId, confirmation);

      // Add the final assistant response
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: finalResponse.response }
      ]);

      // Notify parent if needed
      if (onMessageSent) {
        onMessageSent();
      }

    } catch (error) {
      console.error('Failed to resume chat:', error);
      // Add error message
      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I'm sorry, there was an error processing your confirmation: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]);
    } finally {
      setIsLoading(false);
      setInterruptSessionId(null);
    }
  };

  const handleRefreshHistory = async () => {
    if (isLoadingHistory) return;
    
    setIsLoadingHistory(true);
    try {
      // Get history from database
      if (accountId) {
        const conversations = await getConversationHistory(accountId);
        if (conversations && conversations.length > 0) {
          // Convert database conversations to messages
          const historyMessages = conversationsToMessages(conversations);
          setMessages(historyMessages);
          console.log(`Refreshed ${historyMessages.length} messages from database`);
          // Save to localStorage as backup
          saveChatHistory(historyMessages);
        } else {
          // If no conversations, start fresh
          setMessages([
            {
              role: 'assistant',
              content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
            }
          ]);
        }
      }
    } catch (error) {
      console.error('Error refreshing history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className={`flex flex-col ${isFullscreen ? 'h-full' : 'h-full relative bg-background shadow-lg border rounded-lg'}`}>
      {/* Chat header - only show in popup mode or if not fullscreen */}
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
              onClick={handleRefreshHistory}
              disabled={isLoadingHistory}
              aria-label="Refresh history"
              title="Refresh conversation history"
            >
              <RefreshCcw size={18} className={isLoadingHistory ? "animate-spin" : ""} />
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
      
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">Loading conversation history...</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage 
              key={index} 
              message={message} 
              isLast={index === messages.length - 1 && !isLoading && !isInterrupting}
            />
          ))
        )}
        
        {/* Interrupt Confirmation UI */}
        {isInterrupting && (
          <div className="p-3 bg-secondary rounded-lg shadow-sm">
            <p className="text-sm mb-3 whitespace-pre-wrap">{interruptMessage}</p>
            <div className="flex space-x-2 justify-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleInterruptResponse('no')}
                disabled={isLoading}
              >
                <BanIcon className="mr-2 h-4 w-4" /> No
              </Button>
              <Button 
                size="sm"
                onClick={() => handleInterruptResponse('yes')}
                disabled={isLoading}
              >
                <CheckIcon className="mr-2 h-4 w-4" /> Yes
              </Button>
            </div>
          </div>
        )}
        
        {isLoading && !isInterrupting && <ChatSkeleton />}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat input */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isInterrupting ? "Please respond above..." : "Ask about your portfolio..."}
            disabled={isLoading || isLoadingHistory || isInterrupting}
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={!input.trim() || isLoading || isLoadingHistory || isInterrupting}
            size="icon"
          >
            <SendIcon size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
} 