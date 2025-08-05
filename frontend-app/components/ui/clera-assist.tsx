"use client";

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface CleraAssistProps {
  // Content and context
  content: string;          // What user is looking at
  context: string;          // Page context (portfolio, news, invest, etc.)
  prompt: string;           // Pre-written prompt for Clera
  triggerText: string;      // Button text
  description: string;      // Tooltip description
  
  // Configuration
  trigger?: 'hover' | 'tap' | 'auto';
  placement?: 'corner' | 'overlay' | 'inline' | 'header';
  priority?: 'low' | 'medium' | 'high';
  showCondition?: () => boolean;
  
  // Callbacks
  onAssistClick: (prompt: string) => void;
  
  // Children
  children: React.ReactNode;
}

const CleraAssist: React.FC<CleraAssistProps> = ({
  content,
  context,
  prompt,
  triggerText,
  description,
  trigger = 'hover',
  placement = 'corner',
  priority = 'medium',
  showCondition,
  onAssistClick,
  children
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle visibility logic
  useEffect(() => {
    if (showCondition && !showCondition()) {
      setIsVisible(false);
      return;
    }

    if (trigger === 'auto') {
      // Auto-show after delay
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, priority === 'high' ? 1000 : priority === 'medium' ? 2000 : 3000);
    } else if (trigger === 'hover' && !isMobile) {
      setIsVisible(isHovered);
    } else if (trigger === 'tap' || isMobile) {
      // For mobile, show subtle indicator always
      setIsVisible(true);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [trigger, isHovered, priority, showCondition, isMobile]);

  const handleAssistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAssistClick(prompt);
  };

  const handleMouseEnter = () => {
    if (!isMobile) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHovered(false);
    }
  };

  const handleTap = (e: React.TouchEvent) => {
    if (isMobile) {
      e.preventDefault();
      setIsVisible(true);
    }
  };

  const getPriorityClasses = () => {
    switch (priority) {
      case 'high':
        return 'shadow-blue-500/40 shadow-lg';
      case 'medium':
        return 'shadow-blue-500/20 shadow-md';
      case 'low':
        return 'shadow-blue-500/10 shadow-sm';
      default:
        return 'shadow-blue-500/20 shadow-md';
    }
  };

  const getPlacementClasses = () => {
    switch (placement) {
      case 'corner':
        return 'absolute top-2 right-2 z-[9999]';
      case 'overlay':
        return 'absolute inset-0 flex items-center justify-center z-[9999] bg-black/5 backdrop-blur-sm';
      case 'inline':
        return 'relative mt-2 z-[9999]';
      case 'header':
        return 'absolute top-2 right-2 z-[9999]';
      default:
        return 'absolute top-2 right-2 z-[9999]';
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative transition-all duration-300 ease-out",
        isHovered && !isMobile && "clera-glow",
        placement === 'overlay' && isVisible && "overflow-hidden"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTap}
    >
      {children}
      
      {/* Clera Assist Button */}
      {isVisible && (
        <div className={getPlacementClasses()}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleAssistClick}
                  size="sm"
                  className={cn(
                    "clera-assist-button",
                    "bg-gradient-to-r from-blue-600 to-blue-500",
                    "hover:from-blue-700 hover:to-blue-600",
                    "text-white border-0",
                    "transition-all duration-200 ease-out",
                    "transform hover:scale-105 hover:-translate-y-0.5",
                    getPriorityClasses(),
                    // Mobile-specific styles
                    isMobile && "touch-manipulation",
                    // Placement-specific styles
                    placement === 'overlay' && "text-lg px-6 py-3",
                    placement === 'corner' && "text-xs px-3 py-1.5",
                    placement === 'inline' && "text-sm px-4 py-2",
                    placement === 'header' && "text-sm px-4 py-2"
                  )}
                >
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  {triggerText}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs z-[10000]">
                <p className="text-sm">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      {/* Mobile indicator for corner placement */}
      {isMobile && placement === 'corner' && !isVisible && (
        <div className="absolute top-2 right-2 z-[9999]">
          <div className="w-2 h-2 bg-blue-500 rounded-full clera-pulse" />
        </div>
      )}
    </div>
  );
};

export default CleraAssist; 