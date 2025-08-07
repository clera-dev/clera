"use client";

import React from 'react';
import { useMobileNavHeight } from '@/hooks/useMobileNavHeight';
import { cn } from '@/lib/utils';

interface DynamicMobileFooterProps {
  children: React.ReactNode;
  className?: string;
  gap?: number; // Gap above navigation in pixels
  zIndex?: number;
}

/**
 * Dynamic mobile footer that positions content above the mobile navigation
 * Automatically adjusts when mobile browser UI changes (address bar, etc.)
 */
export function DynamicMobileFooter({ 
  children, 
  className, 
  gap = 8,
  zIndex = 40 
}: DynamicMobileFooterProps) {
  const { navHeight, isMobile } = useMobileNavHeight();

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  const bottomOffset = navHeight + gap;

  return (
    <div
      className={cn(
        "fixed left-0 right-0 transition-all duration-200 ease-out",
        className
      )}
      style={{
        bottom: `${bottomOffset}px`,
        zIndex,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Specialized component for investment action buttons
 */
export function MobileInvestmentFooter({ 
  children, 
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DynamicMobileFooter 
      className={cn(
        "bg-background/95 backdrop-blur-md border-t border-border/50 shadow-lg",
        className
      )}
      gap={2} // Reduced from 8px to 2px - minimal gap above nav
      zIndex={40}
    >
      <div className="px-4 py-2"> {/* Reduced from pt-3 pb-3 to py-2 */}
        <div className="bg-background border border-border rounded-lg p-2 shadow-sm"> {/* Reduced from p-3 to p-2 */}
          {children}
        </div>
      </div>
    </DynamicMobileFooter>
  );
}

/**
 * Hook to get dynamic bottom spacing for content that needs to avoid the mobile nav
 */
export function useDynamicBottomSpacing(additionalGap: number = 8) {
  const { navHeight, isMobile } = useMobileNavHeight();
  
  return {
    paddingBottom: isMobile ? `${navHeight + additionalGap}px` : '0px',
    marginBottom: isMobile ? `${navHeight + additionalGap}px` : '0px',
    bottomOffset: isMobile ? navHeight + additionalGap : 0,
  };
}
