"use client";

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  TrendingUp, 
  Newspaper, 
  User,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  onChatOpen: () => void;
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
export default function MobileBottomNav({ onChatOpen, isChatOpen }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (path: string) => pathname === path;

  const handleNavigation = (path: string) => {
    router.push(path);
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
              onClick={() => handleNavigation(item.path)}
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

          {/* Center: Chat Button (Clera Logo) - Consistent with other nav items */}
          <button
            onClick={onChatOpen}
            className={cn(
              "flex flex-col items-center justify-center flex-1 transition-all duration-200",
              "hover:scale-105 active:scale-95",
              isChatOpen && "scale-95"
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
              onClick={() => handleNavigation(item.path)}
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