"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Chat from '@/components/chat/Chat';
import MobileChatHistory from '@/components/mobile/MobileChatHistory';
import { createClient } from '@/utils/supabase/client';
import { cn, getAlpacaAccountId } from '@/lib/utils';

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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load user data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const initializeUserData = async () => {
      setIsLoading(true);
      try {
        // Get user ID from Supabase Auth
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          console.error("User not authenticated", authError);
          return;
        }

        setUserId(user.id);

        // Get Alpaca Account ID using the same method as SideBySideLayout
        const fetchedAccountId = await getAlpacaAccountId();
        if (!fetchedAccountId) {
          console.error("Alpaca Account ID not found");
          return;
        }
        
        setAccountId(fetchedAccountId);
      } catch (error) {
        console.error("Error initializing user data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeUserData();
  }, [isOpen]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setInitialMessages([]);
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
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
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
          bottom: '80px' // Space for flat bottom navigation
        }}
        onClick={onClose}
      />

      {/* Modal container with slide-up animation - fills available space */}
      <div 
        className={cn(
          "fixed inset-x-0 z-60 bg-background shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          // Fill from top to rest on flat bottom nav
          transformOrigin: 'bottom center',
          top: '0',
          bottom: '80px', // Standard nav bar height (h-20 = 80px)
          height: 'calc(100vh - 80px)'
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
              onQuerySent={async () => {}}
              isLimitReached={false}
              onSessionCreated={handleSessionCreated}
              onMessageSent={handleMessageSent}
              isSidebarMode={false}
            />
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