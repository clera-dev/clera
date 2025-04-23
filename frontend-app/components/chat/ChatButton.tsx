"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import Chat from './Chat';

interface ChatButtonProps {
  accountId: string;
  userId: string;
  isLimitReached: boolean;
  onQuerySent: () => Promise<void>;
}

export default function ChatButton({
  accountId,
  userId,
  isLimitReached,
  onQuerySent
}: ChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Floating chat button */}
      <Button
        className={cn(
          "fixed bottom-6 right-6 rounded-full p-4 shadow-lg",
          isOpen ? "hidden" : "flex"
        )}
        size="lg"
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare size={24} className="mr-2" />
        Chat with Clera
      </Button>
      
      {/* Chat interface - Renders if isOpen (userId is guaranteed by parent) */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] z-50">
          <Chat 
            accountId={accountId}
            userId={userId}
            onClose={() => setIsOpen(false)}
            isLimitReached={isLimitReached}
            onQuerySent={onQuerySent}
          />
        </div>
      )}
    </>
  );
} 