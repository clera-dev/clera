import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function CleraAvatar() {
  return (
    <Avatar className="h-8 w-8 border border-primary/10">
      <AvatarImage src="/clera-favicon copy.png" alt="Clera" />
      <AvatarFallback className="bg-gradient-to-br from-pink-500 to-violet-500 text-white">
        C
      </AvatarFallback>
    </Avatar>
  );
} 