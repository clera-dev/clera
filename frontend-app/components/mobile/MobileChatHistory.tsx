"use client";

import React, { useEffect } from 'react';
import ChatSidebar from '@/components/chat/history/ChatSidebar';
import { cn } from '@/lib/utils';

interface MobileChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  currentSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  refreshKey: number;
}

/**
 * Mobile chat history sidebar that slides in from left
 * Covers 2/3 of screen width with clickable area on right to close
 */
export default function MobileChatHistory({
  isOpen,
  onClose,
  accountId,
  currentSessionId,
  onNewChat,
  onSelectSession,
  refreshKey
}: MobileChatHistoryProps) {

  // Prevent body scroll when sidebar is open
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
      {/* Backdrop overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar container with slide-in animation */}
      <div className="fixed inset-y-0 left-0 z-[110] flex">
        {/* Sidebar content - 2/3 width */}
        <div 
          className={cn(
            "w-[66.67vw] bg-background border-r border-border shadow-2xl transition-transform duration-300 ease-out",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {accountId && (
            <ChatSidebar
              accountId={accountId}
              currentSessionId={currentSessionId || undefined}
              onNewChat={onNewChat}
              onSelectSession={onSelectSession}
              onClose={onClose}
              refreshKey={refreshKey}
              isMobile={true}
            />
          )}
        </div>

        {/* Clickable area to close - 1/3 width */}
        <div 
          className="flex-1 min-h-0"
          onClick={onClose}
        />
      </div>
    </>
  );
}