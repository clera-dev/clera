"use client";

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface CleraAssistCardProps {
  title: string;
  content: string;
  context: string;
  prompt: string;
  triggerText: string;
  description: string;
  onAssistClick: (prompt: string) => void;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  skeletonContent?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const CleraAssistCard: React.FC<CleraAssistCardProps> = ({
  title,
  content,
  context,
  prompt,
  triggerText,
  description,
  onAssistClick,
  children,
  isLoading = false,
  error = null,
  skeletonContent,
  className,
  disabled = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAssistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      onAssistClick(prompt);
    }
  };

  const showButton = (isHovered || isMobile) && !disabled;

  return (
    <Card 
      className={cn(
        "bg-card shadow-lg transition-all duration-300 ease-out",
        isHovered && !isMobile && !disabled && "clera-glow",
        disabled && "cursor-default",
        className
      )}
      onMouseEnter={() => !isMobile && !disabled && setIsHovered(true)}
      onMouseLeave={() => !isMobile && !disabled && setIsHovered(false)}
    >
      <CardHeader className="py-3 relative">
        <div className="clera-assist-card-header">
          <CardTitle className="text-base md:text-lg card-title truncate">{title}</CardTitle>
          
          {/* Assist Button - right-aligned, grows leftward, never clips the button itself */}
          <div className={cn(
            "clera-assist-button-container",
            showButton && "visible"
          )}>
            {showButton && (
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
                        "shadow-blue-500/30 shadow-md",
                        "flex items-center gap-1.5",
                        "text-xs px-3 py-1.5",
                        // Mobile-specific styles
                        isMobile && "touch-manipulation"
                      )}
                    >
                      <Sparkles className="w-3 h-3 flex-shrink-0" />
                      <span>{triggerText}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">{description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Mobile indicator when button is not visible */}
            {isMobile && !isHovered && (
              <div className="w-2 h-2 bg-blue-500 rounded-full clera-pulse flex-shrink-0" />
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading && skeletonContent ? (
          skeletonContent
        ) : error ? (
          <p className="text-muted-foreground text-center">{error}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
};

export default CleraAssistCard; 