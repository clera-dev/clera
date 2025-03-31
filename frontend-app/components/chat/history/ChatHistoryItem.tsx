import { Trash2Icon } from 'lucide-react';
import { ChatSession } from '@/utils/api/chat-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ChatHistoryItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function ChatHistoryItem({
  session,
  isActive,
  onSelect,
  onDelete
}: ChatHistoryItemProps) {
  // Get first ~30 chars of title or first message as title
  const title = session.title || 
    (session.messages[0]?.content.substring(0, 30) + 
    (session.messages[0]?.content.length > 30 ? '...' : ''));
  
  // Format the date or provide a fallback
  const formattedDate = (() => {
    try {
      // Check if we have a valid date value
      if (!session.createdAt) return 'Recently';
      
      // Validate date is parseable
      const date = new Date(session.createdAt);
      if (isNaN(date.getTime())) return 'Recently';
      
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Recently';
    }
  })();
  
  return (
    <div 
      className={cn(
        "group flex items-center justify-between rounded-md p-2 text-sm cursor-pointer",
        isActive 
          ? "bg-accent text-accent-foreground" 
          : "hover:bg-muted"
      )}
      onClick={onSelect}
    >
      <div className="flex-1 overflow-hidden">
        <div className="font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground">
          {formattedDate}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete conversation"
      >
        <Trash2Icon size={14} />
      </Button>
    </div>
  );
} 