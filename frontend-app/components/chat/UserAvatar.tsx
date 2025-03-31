import { User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function UserAvatar() {
  return (
    <Avatar className="h-8 w-8 border border-primary/10">
      <AvatarFallback className="bg-background">
        <User className="h-4 w-4" />
      </AvatarFallback>
    </Avatar>
  );
} 