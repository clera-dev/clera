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
  const isUser = message.role === 'user';
  const isStatus = message.isStatus;

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
        "max-w-[85%]",
        isUser 
          ? "rounded-lg px-4 py-3 bg-primary text-primary-foreground"
          : "px-2 py-1", // Minimal padding for assistant, no background
      )}>
        <div className={cn(
          "text-sm leading-relaxed break-words",
          isUser 
            ? "prose-invert" 
            : "text-foreground"
        )}>
          <ReactMarkdown
            components={{
              p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
              h1: ({children}) => <h1 className="text-base font-semibold mb-2 mt-4 first:mt-0">{children}</h1>,
              h2: ({children}) => <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>,
              h3: ({children}) => <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
              ul: ({children}) => <ul className="mb-3 space-y-1 pl-0">{children}</ul>,
              ol: ({children}) => <ol className="mb-3 space-y-1 pl-0">{children}</ol>,
              li: ({children}) => <li className="relative pl-4 before:content-['-'] before:absolute before:left-0">{children}</li>,
              strong: ({children}) => <strong className="font-semibold">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              code: ({children}) => <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs">{children}</code>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
} 