"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, Clock } from 'lucide-react';
import { 
  Message, 
  // createChatSession, // Handled by Chat component interaction with SDK
  // getChatSessions, // Handled by Sidebar
  getUserDailyQueryCount, 
  recordUserQuery
} from '@/utils/api/chat-client';
import { DAILY_QUERY_LIMIT, DAILY_QUERY_LIMIT_MESSAGE } from '@/lib/constants'; // Import limit and message
import Chat from '@/components/chat/Chat';
import ChatSidebar from '@/components/chat/history/ChatSidebar';
import { Button } from '@/components/ui/button';
import { createClient } from "@/utils/supabase/client"; // Import Supabase client
import { getAlpacaAccountId } from "@/lib/utils"; // Import our utility
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

// Key for storing current session in localStorage
const CURRENT_SESSION_KEY = 'cleraCurrentChatSession';

export default function ChatPage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null); // Can be null initially
  const [userId, setUserId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Changed to false by default
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(true); // Unified loading state
  const [error, setError] = useState<string | null>(null); // Unified error state
  const [queryCount, setQueryCount] = useState<number>(0); // State for query count
  const [isLimitReached, setIsLimitReached] = useState<boolean>(false); // State for limit status

  useEffect(() => {
    const initializeChat = async () => {
      setIsLoading(true);
      setError(null);
      setQueryCount(0); // Reset count on initialization
      setIsLimitReached(false);

      let currentUserId: string | null = null; // Temp variable for user ID

      try {
        // 1. Fetch User ID from Supabase Auth
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          throw new Error(authError?.message || "User not authenticated. Cannot load chat.");
        }
        currentUserId = user.id; // Assign to temp variable
        setUserId(currentUserId);

        // 2. Fetch Alpaca Account ID using utility (checks localStorage then Supabase)
        const fetchedAccountId = await getAlpacaAccountId();
        if (!fetchedAccountId) {
          throw new Error("Alpaca Account ID not found. Please complete onboarding.");
        }
        setAccountId(fetchedAccountId);

        // 3. Fetch initial query count for the user
        if (currentUserId) { // Check if user ID was successfully fetched
          const count = await getUserDailyQueryCount(currentUserId);
          setQueryCount(count);
          setIsLimitReached(count >= DAILY_QUERY_LIMIT);
          console.log(`ChatPage: Initial query count: ${count}, Limit reached: ${count >= DAILY_QUERY_LIMIT}`);
        } else {
          // This case should ideally not happen due to the auth check above
          throw new Error("Failed to get user ID before fetching query count."); 
        }

        // 4. Restore current chat session ID from localStorage (if exists) - with user validation
        if (typeof window !== 'undefined') {
          const storedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
          if (storedSessionId) {
            // SECURITY FIX: Validate that the stored session belongs to the current user
            // by checking if we can load its messages without error
            try {
              //console.log(`[ChatPage] Found stored session ${storedSessionId}, validating ownership for user ${currentUserId}`);
              
              // Try to validate the session by making a test call
              const testResponse = await fetch('/api/conversations/get-thread-messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  thread_id: storedSessionId,
                }),
              });

              if (testResponse.ok) {
                //console.log(`[ChatPage] Session ${storedSessionId} validated, restoring for user ${currentUserId}`);
                setCurrentSessionId(storedSessionId);
                setInitialMessages([]);
              } else {
                console.warn(`[ChatPage] Session ${storedSessionId} validation failed (${testResponse.status}), clearing for user ${currentUserId}`);
                localStorage.removeItem(CURRENT_SESSION_KEY);
                setCurrentSessionId(undefined);
                setInitialMessages([]);
              }
            } catch (error) {
              console.warn(`[ChatPage] Session validation error for ${storedSessionId}, clearing:`, error);
              localStorage.removeItem(CURRENT_SESSION_KEY);
              setCurrentSessionId(undefined);
              setInitialMessages([]);
            }
          } else {
             // Start with empty messages to show suggested questions
            setInitialMessages([]);
          }
        }

      } catch (err: any) {
        console.error("Error initializing chat page:", err);
        setError(err.message || "An unexpected error occurred while loading chat data.");
        setAccountId(null); // Clear account ID on error
        setUserId(null); // Clear user ID on error
      } finally {
        setIsLoading(false);
      }
    };

    initializeChat();
  }, []);
  
  // Persist current session ID when it changes (only if not loading and session exists)
  useEffect(() => {
    if (!isLoading && currentSessionId) {
      localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
    }
  }, [currentSessionId, isLoading]);

  const handleNewChat = async () => {
    if (isLoading) return; // Prevent multiple clicks
    console.log('[ChatPage] handleNewChat triggered');
    setIsLoading(true);
    setCurrentSessionId(undefined);
    setInitialMessages([]);
    localStorage.removeItem(CURRENT_SESSION_KEY);
    // Give a moment for the state to clear before allowing a new chat to be created
    setTimeout(() => {
      setIsLoading(false);
      setRefreshTrigger(prev => prev + 1); // Refresh sidebar
      console.log('[ChatPage] New chat state cleared');
    }, 100);
  };

  const handleSelectSession = (sessionId: string) => {
    if (isLoading) return;
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    setCurrentSessionId(sessionId);
    setInitialMessages([]); // Let Chat component load messages
  };

  // Function to handle recording a query and updating the count
  const handleQuerySent = async () => {
    if (!userId) {
      console.error("Cannot record query: User ID not available.");
      // Potentially show an error to the user?
      return;
    }
    try {
      await recordUserQuery(userId);
      const newCount = queryCount + 1;
      setQueryCount(newCount);
      setIsLimitReached(newCount >= DAILY_QUERY_LIMIT);
      console.log(`ChatPage: Query recorded. New count: ${newCount}, Limit reached: ${newCount >= DAILY_QUERY_LIMIT}`);
      // Trigger sidebar refresh if needed (e.g., if it shows usage info)
      setRefreshTrigger(prev => prev + 1); 
    } catch (error) {
      console.error("Failed to record user query:", error);
      // Show error to user? Should we prevent further interaction?
      setError("Failed to record your query. Please try again later or contact support.");
    }
  };

  // Add handler for session creation from Chat component
  const handleSessionCreated = (newSessionId: string) => {
    localStorage.setItem(CURRENT_SESSION_KEY, newSessionId);
    setCurrentSessionId(newSessionId);
    setRefreshTrigger(prev => prev + 1);
  };

  // Add handler for title updates from Chat component
  const handleTitleUpdated = (sessionId: string, newTitle: string) => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Handler for when a message is sent (new or existing thread)
  const handleMessageSent = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <p className="text-muted-foreground">Loading chat data...</p>
      </div>
    );
  }

  // Error State
  if (error) {
     return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)] p-4">
            <Alert variant="destructive" className="max-w-md">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error Loading Chat</AlertTitle>
                <AlertDescription>
                    {error}
                    <br />
                    <Button variant="link" className="p-0 h-auto mt-2" onClick={() => router.refresh()}>Try Reloading</Button>
                </AlertDescription>
            </Alert>
        </div>
     );
  }
  
  // Ensure accountId and userId are available before rendering Chat
  if (!accountId || !userId) {
      // This case should theoretically be covered by the error state, but as a safeguard:
      return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <p className="text-muted-foreground">Missing critical user or account data.</p>
        </div>
      );
  }

  // Render Chat Page
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col relative overflow-hidden">
      {/* Main Content */}
      <div className="flex flex-col h-full w-full max-w-screen-2xl mx-auto relative z-20">
        {/* Header - Fixed at top */}
        <header className="flex-shrink-0 h-16 flex items-center justify-between bg-background relative z-30 px-4 sm:px-6 lg:px-8 border-b">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">Ask Clera</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">Your AI financial advisor is ready to help</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="flex items-center"
              disabled={isLoading}
            >
              <PlusIcon size={16} className="mr-1" />
              New Chat
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex items-center"
            >
              <Clock size={16} className="mr-1" />
              History
            </Button>
          </div>
        </header>
        
        {/* Chat Container - Takes remaining height */}
        <div className="flex-1 min-h-0 relative z-20 px-4 sm:px-6 lg:px-8">
          <Chat 
            accountId={accountId} 
            userId={userId}
            onClose={() => {}} 
            isFullscreen={true} 
            sessionId={currentSessionId}
            initialMessages={initialMessages}
            onQuerySent={handleQuerySent}
            isLimitReached={isLimitReached}
            onSessionCreated={handleSessionCreated}
            onMessageSent={handleMessageSent}
          />
        </div>
      </div>
      
      {/* Sidebar overlay - only render when sidebar is open */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/10 z-30"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Floating Sidebar - only render when sidebar is open */}
      {isSidebarOpen && (
        <div className="fixed top-16 right-4 w-80 h-[calc(100vh-80px)] bg-background border border-border rounded-lg shadow-xl z-40 overflow-hidden">
          {accountId && (
            <ChatSidebar 
              accountId={accountId}
              currentSessionId={currentSessionId}
              onNewChat={handleNewChat}
              onSelectSession={(sessionId) => {
                handleSelectSession(sessionId);
                setIsSidebarOpen(false);
              }}
              onClose={() => setIsSidebarOpen(false)}
              refreshKey={refreshTrigger}
            />
          )}
        </div>
      )}
    </div>
  );
} 