"use client";

import { useState, useEffect } from 'react';
import { Message } from '@/utils/api/chat-client';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar';

import ReactMarkdown from 'react-markdown';

export interface ChatMessageProps {
  message: Message;
  isLast: boolean;
  isMobileMode?: boolean;
  isSidebarMode?: boolean;
}

export default function ChatMessage({ message, isLast, isMobileMode = false, isSidebarMode = false }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStatus = message.isStatus;

  // Special styling for status messages
  if (isStatus) {
    return (
      <div className={cn(
        "flex w-full items-start",
        isMobileMode ? "gap-2" : "gap-4"
      )}>

        <div className={cn(
          "rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950 dark:border-blue-800",
          isMobileMode 
            ? "px-3 py-2 max-w-[95%]" 
            : isSidebarMode
            ? "px-3 py-2 max-w-[90%]" // Side-by-side: tighter padding and width
            : "px-3 py-2 max-w-[85%]" // Desktop: sleeker minimal padding
        )}>
          <div className={cn(
            "text-blue-700 dark:text-blue-300 flex items-center gap-2",
            isMobileMode 
              ? "text-sm" 
              : isSidebarMode 
              ? "text-sm" 
              : "text-base" // Desktop: align with user bubble size for a consistent, sleek look
          )}>
            <div className="flex space-x-1" aria-hidden>
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
      "flex w-full items-start",
      isUser ? "flex-row-reverse" : "flex-row",
      isMobileMode ? "gap-2" : "gap-4"
    )}>

      
      <div className={cn(
        isUser ? "w-fit" : "w-full", // PRODUCTION FIX: User messages size to content, assistant takes full width
        isUser 
          ? "rounded-lg bg-primary text-primary-foreground ml-auto max-w-[65%]" // Compact for short messages, limited for long ones
          : "max-w-full", // Assistant takes full width for balanced padding
        isMobileMode 
          ? (isUser ? "px-3 py-2" : "px-3 py-2") // Mobile: equal padding
          : isSidebarMode
          ? (isUser ? "px-3 py-2" : "px-3 py-2") // Side-by-side: equal padding
          : (isUser ? "px-3 py-2" : "px-3 py-2") // Desktop full-screen: sleeker minimal padding
      )}>
        <div className={cn(
          "break-words",
          // Font size and line height based on context
          isMobileMode 
            ? "text-sm leading-relaxed" // Mobile: compact
            : isSidebarMode 
            ? "text-sm leading-relaxed" // Sidebar: compact 
            : "text-base leading-relaxed", // Desktop: sleeker, tighter typography
          isUser 
            ? "prose-invert" 
            : "text-foreground"
        )}>
          <ReactMarkdown
            components={{
              p: ({children}) => <p className="mb-3 last:mb-0">{children}</p>,
              h1: ({children}) => <h1 className="text-xl font-semibold mb-2 mt-4 first:mt-0">{children}</h1>,
              h2: ({children}) => <h2 className="text-lg font-semibold mb-2 mt-3 first:mt-0">{children}</h2>,
              h3: ({children}) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>,
              ul: ({children}) => <ul className="mb-3 space-y-1 pl-0">{children}</ul>,
              ol: ({children}) => <ol className="mb-3 space-y-1 pl-0">{children}</ol>,
              li: ({children}) => <li className="relative pl-4 before:content-['-'] before:absolute before:left-0">{children}</li>,
              strong: ({children}) => <strong className="font-semibold">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              code: ({children}) => <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs">{children}</code>,
              // Citation links - render as clickable links that open in new tab
              a: ({node, ...props}) => (
                <a 
                  {...props} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline decoration-dotted underline-offset-2 hover:decoration-solid transition-all duration-200"
                />
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
} 