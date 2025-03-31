import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function CleraAvatar() {
  return (
    <Avatar className="h-8 w-8 border border-primary/10">
      <AvatarFallback className="bg-gradient-to-br from-pink-500 to-violet-500 text-white">
        C
      </AvatarFallback>
    </Avatar>
  );
} 