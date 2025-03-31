"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import Chat from './Chat';

interface ChatButtonProps {
  accountId: string;
}

export default function ChatButton({ accountId }: ChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  // Get the user ID from localStorage on mount
  useEffect(() => {
    try {
      const storedUserId = localStorage.getItem('userId');
      setUserId(storedUserId || undefined);
      
      if (!storedUserId) {
        console.error("No user ID found in localStorage");
      }
    } catch (error) {
      console.error("Error accessing localStorage for userId:", error);
    }
  }, []);
  
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
      
      {/* Chat interface */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] z-50">
          <Chat 
            accountId={accountId}
            userId={userId}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </>
  );
} 