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
  const isStatus = message.isStatus;
  
  // Create typing indicator effect for latest assistant message (but not status messages)
  useEffect(() => {
    if (!isUser && isLast && !isStatus) {
      setShowCursor(true);
      const timeout = setTimeout(() => {
        setShowCursor(false);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isUser, isLast, isStatus, message.content]);

  // Special styling for status messages
  if (isStatus) {
    return (
      <div className="flex w-full items-start gap-4">
        <CleraAvatar />
        <div className="rounded-lg px-4 py-2 max-w-[85%] bg-blue-50 border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <div className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
            </div>
            <span className="italic">{message.content}</span>
          </div>
        </div>
      </div>
    );
  }

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