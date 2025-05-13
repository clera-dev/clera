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
      {/* Content container - takes full width when chat is closed, 50% when open */}
      <div 
        className="absolute top-0 bottom-0 left-0 overflow-auto transition-all duration-300"
        style={{ 
          width: isChatOpen ? "50%" : "100%",
          right: isChatOpen ? "50%" : 0
        }}
      >
        {children}
      </div>
      
      {/* Chat container - only shown when chat is open */}
      {isChatOpen && !isLoading && accountId && userId && (
        <div 
          className="absolute top-0 bottom-0 right-0 overflow-hidden z-10"
          style={{ width: "50%" }}
        >
          <SidebarChat 
            accountId={accountId}
            userId={userId}
            onClose={onCloseSideChat}
            width="100%" 
          />
        </div>
      )}
    </div>
  );
} 