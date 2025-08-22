"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Chat from '@/components/chat/Chat';
import MobileChatHistory from '@/components/mobile/MobileChatHistory';
import { createClient } from '@/utils/supabase/client';
import { cn, getAlpacaAccountId } from '@/lib/utils';
import { useMobileNavHeight } from '@/hooks/useMobileNavHeight';
import { queryLimitService } from '@/utils/services/QueryLimitService';
import { DAILY_QUERY_LIMIT } from '@/lib/constants';

interface MobileChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full-screen mobile chat modal that slides up from bottom
 * Follows iOS modal presentation patterns
 */
export default function MobileChatModal({
  isOpen,
  onClose
}: MobileChatModalProps) {
  const { navHeight, viewportHeight } = useMobileNavHeight();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  
  // Query limit state
  const [queryCount, setQueryCount] = useState<number>(0);
  const [isLimitReached, setIsLimitReached] = useState<boolean>(false);

  // Listen for Clera Assist prompts regardless of modal open state
  useEffect(() => {
    const handleCleraAssistPrompt = (event: CustomEvent) => {
      const { prompt } = event.detail;
      if (prompt) {
        // Prepare a fresh session and buffer the prompt for auto-submit on open
        setCurrentSessionId(null);
        setInitialMessages([]);
        setInitialPrompt(prompt);
        setRefreshTrigger(prev => prev + 1);
      }
    };

    window.addEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    return () => {
      window.removeEventListener('cleraAssistPrompt', handleCleraAssistPrompt as EventListener);
    };
  }, []);

  // Load user data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const initializeUserData = async () => {
      setIsLoading(true);
      setError(null); // Clear any previous errors
      
      // Set a timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          setError("Loading timeout. Please try again.");
          setIsLoading(false);
        }
      }, 10000); // 10 second timeout
      
      try {
        // Get user ID from Supabase Auth
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          console.error("User not authenticated", authError);
          setError("Please sign in to use chat");
          setIsLoading(false);
          clearTimeout(timeoutId);
          return;
        }

        setUserId(user.id);

        // Fetch initial query count for the user
        try {
          const count = await queryLimitService.getCurrentQueryCount(user.id);
          setQueryCount(count);
          setIsLimitReached(count >= DAILY_QUERY_LIMIT);
          console.log(`MobileChatModal: Initial query count: ${count}, Limit reached: ${count >= DAILY_QUERY_LIMIT}`);
        } catch (error) {
          console.error("Failed to fetch query count:", error);
          // Don't fail the entire initialization for query count issues
          setQueryCount(0);
          setIsLimitReached(false);
        }

        // Get Alpaca Account ID using the same method as SideBySideLayout
        const fetchedAccountId = await getAlpacaAccountId();
        if (!fetchedAccountId) {
          console.error("Alpaca Account ID not found");
          setError("Account not found. Please complete onboarding first.");
          setIsLoading(false);
          clearTimeout(timeoutId);
          return;
        }
        
        setAccountId(fetchedAccountId);
        clearTimeout(timeoutId);
      } catch (error) {
        console.error("Error initializing user data:", error);
        setError("Failed to load chat. Please try again.");
        clearTimeout(timeoutId);
      } finally {
        setIsLoading(false);
      }
    };

    initializeUserData();
  }, [isOpen]);

  // Note: initialPrompt is cleared after a successful send in handleMessageSent

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setInitialMessages([]);
    setInitialPrompt(null);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleMessageSent = () => {
    setRefreshTrigger(prev => prev + 1);
    // Ensure we do not keep stale prompts that could re-submit on reopen
    if (initialPrompt) {
      setInitialPrompt(null);
    }
  };

  // Function to handle recording a query and updating the count
  const handleQuerySent = async () => {
    if (!userId) {
      console.error("MobileChatModal: Cannot record query - User ID not available.");
      return;
    }
    try {
      await queryLimitService.recordQuery(userId);
      setQueryCount(prevCount => {
        const updated = prevCount + 1;
        setIsLimitReached(updated >= DAILY_QUERY_LIMIT);
        console.log(`MobileChatModal: Query recorded. New count: ${updated}, Limit reached: ${updated >= DAILY_QUERY_LIMIT}`);
        return updated;
      });
    } catch (error) {
      console.error("MobileChatModal: Failed to record user query:", error);
      // Don't throw - this shouldn't break the chat flow
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store current overflow value before hiding it
      const currentOverflow = document.body.style.overflow;
      document.body.dataset.previousOverflow = currentOverflow;
      document.body.style.overflow = 'hidden';
    } else {
      // Restore previous overflow value instead of unconditionally setting to 'unset'
      const previousOverflow = document.body.dataset.previousOverflow || 'unset';
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.previousOverflow;
    }

    return () => {
      // Cleanup: restore previous overflow value if component unmounts while open
      if (isOpen) {
        const previousOverflow = document.body.dataset.previousOverflow || 'unset';
        document.body.style.overflow = previousOverflow;
        delete document.body.dataset.previousOverflow;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with grayed out content - leave space for bottom nav */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{
          bottom: `${navHeight}px` // Dynamic space for bottom navigation
        }}
        onClick={onClose}
      />

      {/* Modal container with slide-up animation - fills available space */}
      <div 
        className={cn(
          "fixed inset-x-0 z-60 bg-background shadow-2xl transition-all duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          // Dynamic fill from top to rest on bottom nav
          transformOrigin: 'bottom center',
          top: '0',
          bottom: `${navHeight}px`, // Dynamic nav bar height
          height: viewportHeight > 0 ? `${Math.max(viewportHeight - navHeight, 0)}px` : `calc(100vh - ${navHeight}px)`
        }}
      >
        {/* Minimal header with icon buttons - no subtitle */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsHistoryOpen(true)}
            className="w-10 h-10 p-0 rounded-full"
          >
            <Menu size={18} />
          </Button>

          <div className="text-center">
            <h2 className="text-base font-semibold">Ask Clera</h2>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="w-10 h-10 p-0 rounded-full"
          >
            <Plus size={18} />
          </Button>
        </div>

        {/* Chat content area */}
        <div className="flex-1 min-h-0 bg-background">
          {!isLoading && accountId && userId ? (
            <Chat
              accountId={accountId}
              userId={userId}
              onClose={onClose}
              isFullscreen={true}
              sessionId={currentSessionId || undefined}
              initialMessages={initialMessages}
              onQuerySent={handleQuerySent}
              isLimitReached={isLimitReached}
              onSessionCreated={handleSessionCreated}
              onMessageSent={handleMessageSent}
              isSidebarMode={false}
              initialPrompt={initialPrompt || undefined}
            />
          ) : error ? (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center max-w-sm">
                <div className="text-destructive mb-4">
                  <X size={48} className="mx-auto mb-2" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={onClose}
                  className="mt-4"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading chat...</p>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Mobile Chat History Sidebar */}
      <MobileChatHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        accountId={accountId}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={(sessionId: string) => {
          handleSelectSession(sessionId);
          setIsHistoryOpen(false);
        }}
        refreshKey={refreshTrigger}
      />
    </>
  );
}