"use client";

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PlusIcon, Clock, X, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Chat from '@/components/chat/Chat';
import { Message } from '@/utils/api/chat-client';
import { getUserDailyQueryCount } from '@/utils/api/chat-client';
import { DAILY_QUERY_LIMIT } from '@/lib/constants';
import ChatSidebar from '@/components/chat/history/ChatSidebar';

interface SidebarChatProps {
  accountId: string;
  userId: string;
  onClose: () => void;
  width?: number | string; // Width in pixels or percentage
  onToggleFullscreen?: () => void; // New prop for fullscreen toggle
  isFullscreen?: boolean; // New prop to know if we're in fullscreen mode
}

export default function SidebarChat({ accountId, userId, onClose, width = 350, onToggleFullscreen, isFullscreen = false }: SidebarChatProps) {
  const [queryCount, setQueryCount] = useState<number>(0);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fetchQueryCount = async () => {
      if (userId) {
        try {
          const count = await getUserDailyQueryCount(userId);
          setQueryCount(count);
        } catch (error) {
          console.error("Failed to fetch query count:", error);
        }
      }
    };

    fetchQueryCount();
  }, [userId]);

  const handleQuerySent = async () => {
    if (!userId) return;
    // Recording is handled centrally in Chat via querySuccessCallback.
    // Here we only update UI state atomically.
    setQueryCount(prev => prev + 1);
  };

  const handleNewChat = () => {
    setCurrentSessionId(undefined);
    setInitialMessages([]);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSelectSession = (sessionId: string) => {
    console.log(`[SidebarChat] Selecting session: ${sessionId}`);
    setCurrentSessionId(sessionId);
    // Clear initial messages since Chat component will load them from the thread
    setInitialMessages([]);
    setIsSidebarOpen(false);
    
    // Also update localStorage to ensure consistency
    localStorage.setItem('cleraCurrentChatSession', sessionId);
    
    // Force a refresh to ensure state is properly updated
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSessionCreated = (newSessionId: string) => {
    setCurrentSessionId(newSessionId);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDoubleClick = () => {
    // Only navigate to chat page if not already on chat page and not in fullscreen
    if (pathname !== '/chat' && !isFullscreen) {
      router.push('/chat');
    }
  };

  // Convert width to a CSS value (either px or %)
  const widthValue = typeof width === 'number' ? `${width}px` : width;

  return (
    <div 
      className="h-full border-l shadow-md bg-background flex flex-col"
      style={{ width: widthValue }}
    >
      {/* Header with New Chat and History buttons - fixed at top */}
      <div className="flex-shrink-0 p-2 border-b bg-background">
        <div className="flex justify-between items-center">
          {/* Expand/Collapse button - left side */}
          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
              className="flex items-center h-8 px-2"
              title={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
            >
              {isFullscreen ? (
                <ChevronsRight size={16} className="text-muted-foreground" />
              ) : (
                <ChevronsLeft size={16} className="text-muted-foreground" />
              )}
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            className="flex items-center h-8"
          >
            <PlusIcon size={14} className="mr-1" />
            New Chat
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex items-center h-8"
          >
            <Clock size={14} className="mr-1" />
            History
          </Button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <Chat
          accountId={accountId}
          userId={userId}
          onClose={onClose}
          isFullscreen={isFullscreen}
          sessionId={currentSessionId}
          initialMessages={initialMessages}
          onQuerySent={handleQuerySent}
          isLimitReached={queryCount >= DAILY_QUERY_LIMIT}
          onSessionCreated={handleSessionCreated}
          isSidebarMode={!isFullscreen}
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