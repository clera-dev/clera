"use client";

import React from 'react';
import { 
  Home, 
  TrendingUp, 
  Newspaper, 
  User,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  onChatToggle: () => void;
  onNavigate: (path: string) => void;
  currentPage: string;
  isChatOpen: boolean;
}

interface NavItem {
  id: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  {
    id: 'portfolio',
    path: '/portfolio',
    icon: Home,
    label: 'Portfolio'
  },
  {
    id: 'invest',
    path: '/invest',
    icon: TrendingUp,
    label: 'Invest'
  },
  {
    id: 'news',
    path: '/news',
    icon: Newspaper,
    label: 'News'
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    icon: User,
    label: 'Dashboard'
  }
];

/**
 * iOS-style bottom navigation with elevated center chat button
 * Follows Apple HIG guidelines for tab bars
 */
export default function MobileBottomNav({ 
  onChatToggle, 
  onNavigate, 
  currentPage, 
  isChatOpen 
}: MobileBottomNavProps) {
  const isActive = (path: string) => {
    // Use prefix matching to keep tabs active on sub-routes
    // This ensures navigation state remains clear when users are within a section
    if (path === '/') {
      // Home path should only match exactly
      return currentPage === path;
    }
    // For other paths, check if currentPage starts with the path
    // This handles sub-routes like /portfolio/analytics, /dashboard/settings, etc.
    return currentPage.startsWith(path);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Navigation bar with curved hump around center logo */}
      <div className="relative bg-background/95 backdrop-blur-md border-t border-border/50">

        
        {/* iOS-style tab bar container */}
        <div className="flex items-end justify-around h-20 px-4 pb-6 pt-2 safe-area-bottom">
          
          {/* Left side: Portfolio & Invest */}
          {navItems.slice(0, 2).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center min-w-0 flex-1 transition-colors duration-200",
                isActive(item.path) 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon 
                size={24} 
                className={cn(
                  "mb-1 transition-all duration-200",
                  isActive(item.path) && "scale-110"
                )} 
              />
              <span className={cn(
                "text-xs font-medium transition-all duration-200",
                isActive(item.path) && "font-semibold"
              )}>
                {item.label}
              </span>
            </button>
          ))}

          {/* Center: Chat Button (Clera Logo) - Shows overlay state */}
          <button
            onClick={onChatToggle}
            className={cn(
              "flex flex-col items-center justify-center flex-1 transition-all duration-200",
              "hover:scale-105 active:scale-95",
              isChatOpen 
                ? "text-primary scale-95" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {/* Clera Circle Logo - same size as other icons */}
            <div className="w-8 h-8 rounded-full overflow-hidden mb-1 shadow-lg">
              <img 
                src="/clera-favicon copy.png" 
                alt="Clera" 
                className="w-full h-full object-cover"
              />
            </div>
            <span className={cn(
              "text-xs font-medium transition-all duration-200",
              isChatOpen && "font-semibold"
            )}>
              Chat
            </span>
          </button>

          {/* Right side: News & Dashboard */}
          {navItems.slice(2, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center min-w-0 flex-1 transition-colors duration-200",
                isActive(item.path) 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon 
                size={24} 
                className={cn(
                  "mb-1 transition-all duration-200",
                  isActive(item.path) && "scale-110"
                )} 
              />
              <span className={cn(
                "text-xs font-medium transition-all duration-200",
                isActive(item.path) && "font-semibold"
              )}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}