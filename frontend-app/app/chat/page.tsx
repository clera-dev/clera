"use client";

import { useState, useEffect } from 'react';
import { PlusIcon } from 'lucide-react';
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
  const [accountId, setAccountId] = useState<string | null>(null); // Can be null initially
  const [userId, setUserId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
        console.log("ChatPage: User ID found:", currentUserId);

        // 2. Fetch Alpaca Account ID using utility (checks localStorage then Supabase)
        const fetchedAccountId = await getAlpacaAccountId();
        if (!fetchedAccountId) {
          throw new Error("Alpaca Account ID not found. Please complete onboarding.");
        }
        setAccountId(fetchedAccountId);
        console.log("ChatPage: Alpaca Account ID found:", fetchedAccountId);

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

        // 4. Restore current chat session ID from localStorage (if exists)
        if (typeof window !== 'undefined') {
          const storedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
          if (storedSessionId) {
            setCurrentSessionId(storedSessionId);
            console.log("ChatPage: Restored session ID:", storedSessionId);
            // Messages will be loaded by the Chat component based on sessionId
            setInitialMessages([]);
          } else {
            console.log("ChatPage: No session ID found in localStorage.");
             // Start with default welcome message if no session restored
            setInitialMessages([
                {
                  role: 'assistant',
                  content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
                }
            ]);
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
    if (!accountId) {
      console.error("Cannot create new chat without Alpaca Account ID");
      setError("Cannot start a new chat: Missing account information.");
      return;
    }
    try {
      // Clear localStorage immediately
      localStorage.removeItem(CURRENT_SESSION_KEY);
      setCurrentSessionId(undefined); // Clear state
      
      // Reset messages immediately for responsiveness
      setInitialMessages([
        {
          role: 'assistant',
          content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
        }
      ]);
      
      // Create a new chat session in the background
      // The Chat component will handle showing the actual session once created
      // No need to await here, let the Chat component manage session creation flow
      // createChatSession(accountId, 'New Conversation'); // Let Chat component handle this
      
      // Force sidebar to refresh (optional, Chat component might handle this)
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Error preparing for new chat session:', error);
      setError("Failed to start a new chat session.");
    }
  };

  const handleSelectSession = (sessionId: string) => {
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
    console.log(`ChatPage received title update for ${sessionId}: ${newTitle}`);
    setRefreshTrigger(prev => prev + 1);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading chat data...</p>
      </div>
    );
  }

  // Error State
  if (error) {
     return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <Alert variant="destructive" className="max-w-md">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error Loading Chat</AlertTitle>
                <AlertDescription>
                    {error}
                    <br />
                    <Button variant="link" className="p-0 h-auto mt-2" onClick={() => window.location.reload()}>Try Reloading</Button>
                </AlertDescription>
            </Alert>
        </div>
     );
  }
  
  // Ensure accountId and userId are available before rendering Chat
  if (!accountId || !userId) {
      // This case should theoretically be covered by the error state, but as a safeguard:
      return (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Missing critical user or account data.</p>
        </div>
      );
  }

  // Render Chat Page
  return (
    <div className="flex h-screen overflow-hidden"> {/* Prevent double scrollbars */}
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col"> {/* Use flex column */}
        {/* Header */}
        <div className="h-16 border-b flex-shrink-0 flex items-center justify-between px-4">
          <h1 className="font-semibold">Chat with Clera</h1>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="flex items-center"
              disabled={isLoading} // Disable during load
            >
              <PlusIcon size={16} className="mr-1" />
              New Chat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden"
            >
              History
            </Button>
          </div>
        </div>
        
        {/* Chat Component takes remaining space */}
        <div className="flex-grow overflow-y-auto"> {/* Allow Chat component to scroll */}
          <Chat 
            accountId={accountId} 
            userId={userId}
            onClose={() => {}} 
            isFullscreen={true} 
            sessionId={currentSessionId}
            initialMessages={initialMessages} // Pass potentially empty array
            onQuerySent={handleQuerySent} // Pass the new handler
            isLimitReached={isLimitReached} // Pass limit status
            onSessionCreated={handleSessionCreated}
            onTitleUpdated={handleTitleUpdated}
            // key={currentSessionId || 'new'} // Force re-render on session change
          />
        </div>
      </div>
      
      {/* Chat Sidebar */}
      <div className={`w-72 border-l bg-background flex-shrink-0 ${isSidebarOpen ? 'block' : 'hidden lg:block'}`}>
        <ChatSidebar 
          accountId={accountId}
          currentSessionId={currentSessionId}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onClose={() => setIsSidebarOpen(false)}
          refreshKey={refreshTrigger}
        />
      </div>
    </div>
  );
} 