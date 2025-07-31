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
  isMobile?: boolean;
}

export default function ChatHistoryItem({
  session,
  isActive,
  onSelect,
  onDelete,
  isMobile = false
}: ChatHistoryItemProps) {
  // Get first ~30 chars of title or first message as title
  const title = session.title || 
    (session.messages[0]?.content.substring(0, 30) + 
    (session.messages[0]?.content.length > 30 ? '...' : ''));
  
  // Format the date or provide a fallback
  const formattedDate = (() => {
    try {
      // Check if we have a valid date value
      if (!session.updatedAt) return 'Recently';
      
      // Validate date is parseable
      const date = new Date(session.updatedAt);
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
        "group flex items-center justify-between rounded-md cursor-pointer",
        isMobile 
          ? "p-1.5 text-xs" // Thinner mobile version
          : "p-2 text-sm",   // Regular desktop version
        isActive 
          ? "bg-accent text-accent-foreground" 
          : "hover:bg-muted"
      )}
      onClick={onSelect}
    >
      <div className="flex-1 overflow-hidden">
        <div className={cn(
          "font-medium truncate",
          isMobile ? "text-xs" : "text-sm"
        )}>
          {isMobile ? title.substring(0, 25) + (title.length > 25 ? '...' : '') : title}
        </div>
        {!isMobile && (
          <div className="text-xs text-muted-foreground">
            {formattedDate}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "opacity-0 group-hover:opacity-100",
          isMobile ? "w-6 h-6" : "w-8 h-8"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete conversation"
      >
        <Trash2Icon size={isMobile ? 12 : 14} />
      </Button>
    </div>
  );
} 