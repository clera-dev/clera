"use client";

import { useState, useEffect } from 'react';
import { PlusIcon } from 'lucide-react';
import { Message, createChatSession, getChatSessions } from '@/utils/api/chat-client';
import Chat from '@/components/chat/Chat';
import ChatSidebar from '@/components/chat/history/ChatSidebar';
import { Button } from '@/components/ui/button';

// Key for storing current session in localStorage
const CURRENT_SESSION_KEY = 'cleraCurrentChatSession';

export default function ChatPage() {
  const [accountId, setAccountId] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    // Load account ID and user ID, restore current session ID from localStorage
    if (typeof window !== 'undefined') {
      const storedAccountId = localStorage.getItem('alpacaAccountId') || '';
      const storedUserId = localStorage.getItem('userId');
      setAccountId(storedAccountId);
      setUserId(storedUserId);
      
      // Try to restore the current session if it exists
      const storedSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
      if (storedSessionId) {
        setCurrentSessionId(storedSessionId);
        // We'll fetch messages for this session in the Chat component
        setInitialMessages([]);
      }
    }
    
    setIsInitialLoad(false);
  }, []);
  
  // Persist current session ID when it changes
  useEffect(() => {
    if (!isInitialLoad && currentSessionId) {
      localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
    }
  }, [currentSessionId, isInitialLoad]);

  const handleNewChat = async () => {
    try {
      // Clear localStorage when creating a new chat
      localStorage.removeItem(CURRENT_SESSION_KEY);
      
      // Create a new chat session
      const session = await createChatSession(accountId, 'New Conversation');
      if (session) {
        setCurrentSessionId(session.id);
        // Reset messages
        setInitialMessages([
          {
            role: 'assistant',
            content: "Hello, I'm Clera, your personal financial advisor. How can I help you with your portfolio today?"
          }
        ]);
        // Force sidebar to refresh
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error creating new chat session:', error);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    // Store the selected session ID
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    setCurrentSessionId(sessionId);
    // The Chat component will load messages for this session
    setInitialMessages([]);
  };

  // Function to handle when a chat message is sent successfully
  const handleChatSent = () => {
    // Trigger sidebar refresh
    setRefreshTrigger(prev => prev + 1);
  };

  // Add handler for session creation
  const handleSessionCreated = (newSessionId: string) => {
    // Store the new session ID
    localStorage.setItem(CURRENT_SESSION_KEY, newSessionId);
    setCurrentSessionId(newSessionId);
    
    // Trigger sidebar refresh to show the new session
    setRefreshTrigger(prev => prev + 1);
  };

  // Add handler for title updates
  const handleTitleUpdated = (sessionId: string, newTitle: string) => {
    console.log(`ChatPage received title update for ${sessionId}: ${newTitle}`);
    // Trigger sidebar refresh to potentially show the new title
    setRefreshTrigger(prev => prev + 1);
  };

  if (!accountId || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading user data...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Main Chat Area */}
      <div className="flex-1 relative">
        {/* Header */}
        <div className="h-16 border-b flex items-center justify-between px-4">
          <h1 className="font-semibold">Chat with Clera</h1>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              className="flex items-center"
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
        
        {/* Chat */}
        <div className="h-[calc(100vh-4rem)]">
          <Chat 
            accountId={accountId} 
            userId={userId}
            onClose={() => {}} 
            isFullscreen={true} 
            sessionId={currentSessionId}
            initialMessages={initialMessages}
            onMessageSent={handleChatSent}
            onSessionCreated={handleSessionCreated}
            onTitleUpdated={handleTitleUpdated}
          />
        </div>
      </div>
      
      {/* Chat Sidebar */}
      <div className={`w-72 border-l bg-background ${isSidebarOpen ? 'block' : 'hidden lg:block'}`}>
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