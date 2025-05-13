"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Chat from '@/components/chat/Chat';
import { Message } from '@/utils/api/chat-client';
import { getUserDailyQueryCount, recordUserQuery } from '@/utils/api/chat-client';
import { DAILY_QUERY_LIMIT } from '@/lib/constants';
import ChatSidebar from '@/components/chat/history/ChatSidebar';

interface SidebarChatProps {
  accountId: string;
  userId: string;
  onClose: () => void;
  width?: number | string; // Width in pixels or percentage
}

export default function SidebarChat({ accountId, userId, onClose, width = 350 }: SidebarChatProps) {
  const [queryCount, setQueryCount] = useState<number>(0);
  const [isLimitReached, setIsLimitReached] = useState<boolean>(false);
  const [initialMessages, setInitialMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello, I'm Clera. How can I help you with your portfolio today?"
    }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const fetchQueryCount = async () => {
      if (userId) {
        try {
          const count = await getUserDailyQueryCount(userId);
          setQueryCount(count);
          setIsLimitReached(count >= DAILY_QUERY_LIMIT);
        } catch (error) {
          console.error("Failed to fetch query count:", error);
        }
      }
    };

    fetchQueryCount();
  }, [userId]);

  const handleQuerySent = async () => {
    if (!userId) return;
    
    try {
      await recordUserQuery(userId);
      const newCount = queryCount + 1;
      setQueryCount(newCount);
      setIsLimitReached(newCount >= DAILY_QUERY_LIMIT);
    } catch (error) {
      console.error("Failed to record user query:", error);
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(undefined);
    setInitialMessages([
      {
        role: 'assistant',
        content: "Hello, I'm Clera. How can I help you with your portfolio today?"
      }
    ]);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setInitialMessages([]);
    setIsSidebarOpen(false);
  };

  const handleSessionCreated = (newSessionId: string) => {
    setCurrentSessionId(newSessionId);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDoubleClick = () => {
    router.push('/chat');
  };

  // Convert width to a CSS value (either px or %)
  const widthValue = typeof width === 'number' ? `${width}px` : width;

  return (
    <div 
      className="h-full border-l shadow-md bg-background flex flex-col"
      style={{ width: widthValue }}
    >
      <div className="flex-shrink-0 p-2 border-b flex justify-between items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleNewChat}
          className="flex items-center h-8"
        >
          <PlusIcon size={14} className="mr-1" />
          New Chat
        </Button>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center h-8"
          >
            <Clock size={14} className="mr-1" />
            History
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 flex items-center justify-center"
            aria-label="Close chat"
          >
            <X size={16} />
          </Button>
        </div>
      </div>
      <div className="flex-grow h-[calc(100%-40px)] overflow-hidden relative">
        <Chat
          accountId={accountId}
          userId={userId}
          onClose={onClose}
          isFullscreen={false}
          sessionId={currentSessionId}
          initialMessages={initialMessages}
          onQuerySent={handleQuerySent}
          isLimitReached={isLimitReached}
          onSessionCreated={handleSessionCreated}
          isSidebarMode={true}
        />
        
        {/* Overlay for sidebar */}
        {isSidebarOpen && (
          <div 
            className="absolute inset-0 bg-black/10 z-30"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        {/* Chat history sidebar */}
        {isSidebarOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-background border-l shadow-lg z-40">
            <ChatSidebar 
              accountId={accountId}
              currentSessionId={currentSessionId}
              onNewChat={handleNewChat}
              onSelectSession={handleSelectSession}
              onClose={() => setIsSidebarOpen(false)}
              refreshKey={refreshTrigger}
            />
          </div>
        )}
      </div>
    </div>
  );
} 