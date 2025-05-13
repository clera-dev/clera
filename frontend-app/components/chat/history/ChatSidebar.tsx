'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { 
  ChatSession, 
  getChatSessions,
  groupChatsByDate,
  deleteChatSession 
} from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ChatHistoryItem from './ChatHistoryItem';

interface ChatSidebarProps {
  accountId: string;
  currentSessionId?: string;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  refreshKey?: number;
}

export default function ChatSidebar({
  accountId,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onClose,
  refreshKey = 0
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Load chat sessions when mounted or when refreshKey changes
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      try {
        const chatSessions = await getChatSessions(accountId);
        setSessions(chatSessions);
      } catch (error) {
        console.error('Error loading chat sessions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, [accountId, refreshKey]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const success = await deleteChatSession(deleteId);
      if (success) {
        setSessions(sessions.filter(session => session.id !== deleteId));
        
        // If the deleted session is the current one, create a new chat
        if (deleteId === currentSessionId) {
          onNewChat();
        }
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setShowDeleteDialog(false);
      setDeleteId(null);
    }
  };

  const groupedSessions = groupChatsByDate(sessions);

  return (
    <div className="flex flex-col h-full bg-background border-r w-72 z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Chat History</h2>
        <div className="flex space-x-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            title="Close Sidebar"
          >
            <XIcon size={18} />
          </Button>
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded-md animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-muted-foreground">
            <p>Your conversations will appear here</p>
            <Button 
              variant="link" 
              onClick={onNewChat}
              className="mt-2"
            >
              Start a new chat
            </Button>
          </div>
        ) : (
          // Session groups
          <div className="space-y-4">
            {groupedSessions.today.length > 0 && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 px-2">Today</h3>
                {groupedSessions.today.map(session => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => {
                      setDeleteId(session.id);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            )}

            {groupedSessions.yesterday.length > 0 && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 px-2">Yesterday</h3>
                {groupedSessions.yesterday.map(session => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => {
                      setDeleteId(session.id);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            )}

            {groupedSessions.lastWeek.length > 0 && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 px-2">Last 7 Days</h3>
                {groupedSessions.lastWeek.map(session => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => {
                      setDeleteId(session.id);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            )}

            {groupedSessions.lastMonth.length > 0 && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 px-2">Last 30 Days</h3>
                {groupedSessions.lastMonth.map(session => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => {
                      setDeleteId(session.id);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            )}

            {groupedSessions.older.length > 0 && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 px-2">Older</h3>
                {groupedSessions.older.map(session => (
                  <ChatHistoryItem
                    key={session.id}
                    session={session}
                    isActive={session.id === currentSessionId}
                    onSelect={() => onSelectSession(session.id)}
                    onDelete={() => {
                      setDeleteId(session.id);
                      setShowDeleteDialog(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation history.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 