"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
// NOTE: getAlpacaAccountId is deprecated - Alpaca integration paused, using SnapTrade only
import SidebarChat from '@/components/chat/SidebarChat';

interface SideBySideLayoutProps {
  children: React.ReactNode;
  isChatOpen: boolean;
  onCloseSideChat: () => void;
  initialChatWidth?: number;
  minChatWidth?: number;
  maxChatWidthPercent?: number;
}

const CHAT_WIDTH_STORAGE_KEY = 'cleraChatWidth';
const DEFAULT_CHAT_WIDTH = 450; // Default width in pixels
const MIN_CHAT_WIDTH = 320; // Minimum width
const MAX_CHAT_WIDTH_PERCENT = 0.6; // Maximum 60% of screen

export default function SideBySideLayout({ 
  children, 
  isChatOpen, 
  onCloseSideChat,
  initialChatWidth = DEFAULT_CHAT_WIDTH,
  minChatWidth = MIN_CHAT_WIDTH,
  maxChatWidthPercent = MAX_CHAT_WIDTH_PERCENT
}: SideBySideLayoutProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  
  // Resizable chat width state
  const [chatWidth, setChatWidth] = useState<number>(initialChatWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringDivider, setIsHoveringDivider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load saved chat width from localStorage (clamped to current viewport)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWidth = localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
      if (savedWidth) {
        const parsedWidth = parseInt(savedWidth, 10);
        if (!isNaN(parsedWidth)) {
          // CRITICAL: Clamp to current viewport max to prevent negative main content width
          // This handles the case where user saved a width on a large screen but now uses smaller screen
          const maxAllowedWidth = Math.floor(window.innerWidth * maxChatWidthPercent);
          // On very small viewports, max may be less than min - use the smaller of the two as lower bound
          const effectiveMin = Math.min(minChatWidth, maxAllowedWidth);
          const clampedWidth = Math.max(effectiveMin, Math.min(parsedWidth, maxAllowedWidth));
          setChatWidth(clampedWidth);
        }
      }
    }
  }, [minChatWidth, maxChatWidthPercent]);

  // Save chat width to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && chatWidth !== initialChatWidth) {
      localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, chatWidth.toString());
    }
  }, [chatWidth, initialChatWidth]);

  // Re-clamp chat width when window is resized to prevent negative main content width
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      const maxAllowedWidth = Math.floor(window.innerWidth * maxChatWidthPercent);
      // On very small viewports, max may be less than min - use the smaller as lower bound
      const effectiveMin = Math.min(minChatWidth, maxAllowedWidth);
      setChatWidth(prev => Math.max(effectiveMin, Math.min(prev, maxAllowedWidth)));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [maxChatWidthPercent, minChatWidth]);

  // Reset fullscreen state whenever chat closes
  useEffect(() => {
    if (!isChatOpen && isChatFullscreen) {
      setIsChatFullscreen(false);
    }
  }, [isChatOpen, isChatFullscreen]);

  const toggleChatFullscreen = () => {
    setIsChatFullscreen(prev => !prev);
  };

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;
      
      // Calculate new chat width (from right edge)
      let newWidth = containerWidth - mouseX;
      
      // Apply constraints
      const maxWidth = containerWidth * maxChatWidthPercent;
      newWidth = Math.max(minChatWidth, Math.min(maxWidth, newWidth));
      
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, maxChatWidthPercent, minChatWidth]);

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
        
        // NOTE: Alpaca integration is paused - using SnapTrade only
        // accountId is set to null (not used for SnapTrade/aggregation mode)
        setAccountId(null);
      } catch (error) {
        console.error("Error initializing user data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeUserData();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Content container - hidden when chat is fullscreen */}
      {!isChatFullscreen && (
        <div 
          className={`absolute top-0 bottom-0 left-0 overflow-y-auto overflow-x-hidden ${!isDragging ? 'transition-all duration-300' : ''}`}
          style={{ 
            width: isChatOpen ? `calc(100% - ${chatWidth}px)` : "100%",
          }}
        >
          {children}
        </div>
      )}
      
      {/* Draggable divider - only show when chat is open and not fullscreen */}
      {isChatOpen && !isChatFullscreen && !isLoading && userId && (
        <div
          className={`absolute top-0 bottom-0 w-1 cursor-col-resize z-20 group ${!isDragging ? 'transition-all duration-300' : ''}`}
          style={{ 
            left: `calc(100% - ${chatWidth}px - 2px)`,
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHoveringDivider(true)}
          onMouseLeave={() => !isDragging && setIsHoveringDivider(false)}
        >
          {/* Wider hit area for easier grabbing */}
          <div className="absolute inset-y-0 -left-2 -right-2" />
          
          {/* Visual divider line */}
          <div 
            className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 transition-all duration-150 ${
              isDragging || isHoveringDivider 
                ? 'bg-primary w-1.5 shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
                : 'bg-border/50 hover:bg-primary/50'
            }`}
          />
          
          {/* Drag handle indicator - appears on hover */}
          <div 
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150 ${
              isDragging || isHoveringDivider ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex flex-col gap-1 bg-primary rounded-full p-1.5">
              <div className="w-0.5 h-3 bg-white rounded-full" />
              <div className="w-0.5 h-3 bg-white rounded-full" />
            </div>
          </div>
        </div>
      )}
      
      {/* Chat container - positioned based on fullscreen state */}
      {isChatOpen && !isLoading && userId && (
        <div 
          className={`absolute overflow-hidden z-10 ${!isDragging ? 'transition-all duration-300' : ''}`}
          style={{ 
            top: isChatFullscreen ? 0 : '64px', // Full height when fullscreen, below header when sidebar
            bottom: 0,
            right: 0,
            width: isChatFullscreen ? "100%" : `${chatWidth}px`,
          }}
        >
          <SidebarChat 
            accountId={accountId || undefined}
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