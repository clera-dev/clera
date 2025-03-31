import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  MessageSquare, 
  BarChart2, 
  User,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MainSidebarProps {
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (isOpen: boolean) => void;
}

export default function MainSidebar({
  isMobileSidebarOpen,
  setIsMobileSidebarOpen
}: MainSidebarProps) {
  const pathname = usePathname();
  const [alpacaAccountId, setAlpacaAccountId] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedAccountId = localStorage.getItem('alpacaAccountId') || '';
      setAlpacaAccountId(storedAccountId);
    }
  }, []);

  const navItems = [
    {
      name: 'Chat with Clera',
      href: '/chat',
      icon: MessageSquare,
    },
    {
      name: 'Portfolio',
      href: '/portfolio',
      icon: BarChart2,
    },
    {
      name: 'Account',
      href: '/dashboard',
      icon: User,
    },
  ];

  return (
    <>
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 p-4 z-40">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        >
          <Menu size={24} />
        </Button>
      </div>

      {/* Sidebar container - changes visibility based on mobile state */}
      <div 
        className={cn(
          "fixed inset-0 z-30 lg:relative",
          isMobileSidebarOpen ? "block" : "hidden lg:block"
        )}
      >
        {/* Overlay for mobile */}
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />

        {/* Actual sidebar */}
        <aside className="fixed top-0 left-0 h-full w-64 border-r bg-background z-40 lg:relative">
          <div className="flex flex-col h-full">
            {/* Logo / Brand */}
            <div className="flex items-center h-16 px-4 border-b">
              <Link href="/" className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-full bg-primary" />
                <span className="font-bold text-xl">Clera</span>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-2">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  
                  return (
                    <li key={item.href}>
                      <Link 
                        href={item.href} 
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground",
                          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                        )}
                        onClick={() => setIsMobileSidebarOpen(false)}
                      >
                        <item.icon size={20} />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* User section at bottom */}
            <div className="border-t p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <User size={16} className="text-muted-foreground" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate">User Profile</p>
                  <p className="text-xs text-muted-foreground truncate">user@example.com</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
} 