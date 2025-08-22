"use client";

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { getAlpacaAccountId } from "@/lib/utils";
import SidebarChat from '@/components/chat/SidebarChat';

interface SideBySideLayoutProps {
  children: React.ReactNode;
  isChatOpen: boolean;
  onCloseSideChat: () => void;
  chatWidth?: number | string;
}

export default function SideBySideLayout({ 
  children, 
  isChatOpen, 
  onCloseSideChat,
  chatWidth = "50%" // Default to 50% width
}: SideBySideLayoutProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);

  // Reset fullscreen state whenever chat closes
  useEffect(() => {
    if (!isChatOpen && isChatFullscreen) {
      setIsChatFullscreen(false);
    }
  }, [isChatOpen, isChatFullscreen]);

  const toggleChatFullscreen = () => {
    setIsChatFullscreen(prev => !prev);
  };

  useEffect(() => {
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
        
        // Get Alpaca Account ID
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
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Content container - hidden when chat is fullscreen, 50% when chat open, full when chat closed */}
      {!isChatFullscreen && (
        <div 
          className="absolute top-0 bottom-0 left-0 overflow-y-auto overflow-x-hidden transition-all duration-300"
          style={{ 
            width: isChatOpen ? `calc(100% - ${typeof chatWidth === 'number' ? chatWidth + 'px' : chatWidth})` : "100%",
            right: isChatOpen ? (typeof chatWidth === 'number' ? chatWidth + 'px' : chatWidth) : 0
          }}
        >
          {children}
        </div>
      )}
      
      {/* Chat container - positioned based on fullscreen state */}
      {isChatOpen && !isLoading && accountId && userId && (
        <div 
          className="absolute overflow-hidden z-10 transition-all duration-300"
          style={{ 
            top: isChatFullscreen ? 0 : '64px', // Full height when fullscreen, below header when sidebar
            bottom: 0,
            right: 0,
            width: isChatFullscreen ? "100%" : (typeof chatWidth === 'number' ? chatWidth + 'px' : chatWidth),
            left: isChatFullscreen ? 0 : `calc(100% - ${typeof chatWidth === 'number' ? chatWidth + 'px' : chatWidth})`
          }}
        >
          <SidebarChat 
            accountId={accountId}
            userId={userId}
            onClose={onCloseSideChat}
            width="100%"
            onToggleFullscreen={toggleChatFullscreen}
            isFullscreen={isChatFullscreen}
          />
        </div>
      )}
    </div>
  );
} 