"use client";

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import CleraAvatar from './CleraAvatar';

export default function ChatSkeleton() {
  const [dots, setDots] = useState(1);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev % 3) + 1);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex w-full items-start gap-4">
      <CleraAvatar />
      
      <div className={cn(
        "rounded-lg px-4 py-3 bg-muted min-h-[40px] min-w-[120px] flex items-center"
      )}>
        <div className="text-sm text-muted-foreground">
          Thinking{Array(dots).fill('.').join('')}
        </div>
      </div>
    </div>
  );
} 