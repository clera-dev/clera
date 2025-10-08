"use client";

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MobileTooltipProps {
  content: React.ReactNode;
  isVisible: boolean;
  position?: { x: number; y: number };
  offset?: number;
  className?: string;
}

/**
 * Custom mobile tooltip that positions above touch points
 * Automatically adjusts position to stay within viewport
 */
export function MobileTooltip({ 
  content, 
  isVisible, 
  position = { x: 0, y: 0 }, 
  offset = 60,
  className 
}: MobileTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (!isVisible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y - offset; // Start above finger by default

    // Adjust horizontal position to stay within viewport
    if (adjustedX + rect.width > viewportWidth - 10) {
      adjustedX = viewportWidth - rect.width - 10;
    }
    if (adjustedX < 10) {
      adjustedX = 10;
    }

    // Adjust vertical position to stay within viewport
    if (adjustedY < 10) {
      // If too close to top, position below finger instead
      adjustedY = position.y + offset;
    }
    if (adjustedY + rect.height > viewportHeight - 10) {
      // If too close to bottom, position above finger with more offset
      adjustedY = position.y - rect.height - offset;
    }

    // CRITICAL FIX: Only update if position actually changed to prevent infinite re-renders
    const newPosition = { x: adjustedX, y: adjustedY };
    setAdjustedPosition(prev => {
      if (prev.x !== newPosition.x || prev.y !== newPosition.y) {
        return newPosition;
      }
      return prev;
    });
  }, [position.x, position.y, isVisible, offset]); // FIXED: Use position.x, position.y instead of position object

  if (!isVisible) return null;

  return (
    <div
      ref={tooltipRef}
      className={cn(
        "fixed z-[1000] bg-popover border border-border rounded-md shadow-lg px-3 py-2",
        "text-sm text-popover-foreground pointer-events-none",
        "animate-in fade-in-0 zoom-in-95 duration-200",
        className
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        transform: 'translate(-50%, 0)' // Center horizontally on touch point
      }}
    >
      {content}
    </div>
  );
}

/**
 * Hook to create mobile-aware chart tooltips
 */
export function useMobileChartTooltip() {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [content, setContent] = useState<React.ReactNode>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const showTooltip = (x: number, y: number, tooltipContent: React.ReactNode) => {
    // Show tooltip on all devices for unified behavior
    // Only update if position actually changed to prevent infinite loops
    setPosition(prev => {
      if (prev.x === x && prev.y === y) return prev;
      return { x, y };
    });
    setContent(tooltipContent);
    setIsVisible(true);
  };

  const hideTooltip = () => {
    setIsVisible(false);
    setContent(null);
  };

  const updatePosition = (x: number, y: number) => {
    if (isVisible) {
      setPosition(prev => {
        if (prev.x === x && prev.y === y) return prev;
        return { x, y };
      });
    }
  };

  return {
    isVisible,
    position,
    content,
    isMobile,
    showTooltip,
    hideTooltip,
    updatePosition,
    TooltipComponent: () => (
      <MobileTooltip
        content={content}
        isVisible={isVisible}
        position={position}
      />
    )
  };
}
