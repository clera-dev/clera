"use client";

import { useState, useEffect } from 'react';
import { Message } from '@/utils/api/chat-client';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar';
import CleraAvatar from './CleraAvatar';
import ReactMarkdown from 'react-markdown';

export interface ChatMessageProps {
  message: Message;
  isLast: boolean;
}

export default function ChatMessage({ message, isLast }: ChatMessageProps) {
  const [showCursor, setShowCursor] = useState(false);
  const isUser = message.role === 'user';
  
  // Create typing indicator effect for latest assistant message
  useEffect(() => {
    if (!isUser && isLast) {
      setShowCursor(true);
      const timeout = setTimeout(() => {
        setShowCursor(false);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isUser, isLast, message.content]);

  return (
    <div className={cn(
      "flex w-full items-start gap-4",
      isUser ? "flex-row-reverse" : "flex-row"
    )}>
      {isUser ? <UserAvatar /> : <CleraAvatar />}
      
      <div className={cn(
        "rounded-lg px-4 py-3 max-w-[85%]",
        isUser 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted",
      )}>
        <div className="prose dark:prose-invert prose-sm break-words whitespace-pre-wrap">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {showCursor && (
            <span className="animate-pulse ml-1">▏</span>
          )}
        </div>
      </div>
    </div>
  );
} 