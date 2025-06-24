import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { 
  MessageSquare, 
  BarChart2, 
  User,
  Menu,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  Info,
  DollarSign,
  Newspaper,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MainSidebarProps {
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (isOpen: boolean) => void;
  onToggleSideChat?: () => void;
  sideChatVisible?: boolean;
}

// Time threshold for double click in milliseconds
const DOUBLE_CLICK_THRESHOLD = 300;

export default function MainSidebar({
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  onToggleSideChat,
  sideChatVisible = false
}: MainSidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();
  
  // Set mounted state for client-side rendering
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Store collapsed state in localStorage to persist between page refreshes
  useEffect(() => {
    // Immediately get the collapsed state from localStorage on component mount
    const storedState = localStorage.getItem('sidebarCollapsed');
    if (storedState) {
      const collapsed = storedState === 'true';
      setIsCollapsed(collapsed);
    }
    
    // Listen for changes to the collapsed state from other components
    const handleStorageChange = () => {
      const updatedState = localStorage.getItem('sidebarCollapsed');
      const newCollapsedState = updatedState === 'true';
      console.log('MainSidebar: Received storage change event, updating collapsed state to:', newCollapsedState);
      setIsCollapsed(newCollapsedState);
    };
    
    // Handle storage events from other tabs/windows
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for changes within the same window (like from autoCollapseSidebar)
    window.addEventListener('sidebarCollapsedChange', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarCollapsedChange', handleStorageChange);
    };
  }, []);
  
  // Update localStorage when collapsed state changes
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
    }
  }, [isCollapsed, isMounted]);

  // Ensure state stays consistent during navigation
  useEffect(() => {
    if (isNavigating) {
      // Immediately restore collapsed state from localStorage during navigation
      const storedState = localStorage.getItem('sidebarCollapsed');
      if (storedState === 'true') {
        setIsCollapsed(true);
      }
      setIsNavigating(false);
    }
  }, [pathname, isNavigating]);

  const navItems = [
    {
      name: 'Ask Clera',
      href: '/chat',
      icon: MessageSquare,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        const currentTime = new Date().getTime();
        
        if (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
          // Double click - navigate to chat page
          if (isCollapsed) {
            setIsNavigating(true);
          }
          router.push('/chat');
        } else {
          // Single click - toggle side chat
          if (onToggleSideChat) {
            onToggleSideChat();
          }
        }
        
        setLastClickTime(currentTime);
      }
    },
    {
      name: 'Portfolio',
      href: '/portfolio',
      icon: BarChart2,
    },
    {
      name: 'Invest',
      href: '/invest',
      icon: TrendingUp,
    },
    {
      name: 'News',
      href: '/news',
      icon: Newspaper,
    },
  ];

  // Bottom icons (these will be placed above the user profile)
  const bottomIcons = [
    {
      name: 'Account',
      href: '/dashboard',
      icon: User,
    },
    {
      name: 'Information',
      href: '/info',
      icon: Info,
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    
    // Update localStorage immediately
    localStorage.setItem('sidebarCollapsed', newState.toString());
    
    // Dispatch a custom event to notify other components in the same window
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sidebarCollapsedChange'));
    }
  };

  // Enhanced navigation handler that preserves collapsed state
  const handleNavigation = (href: string, e: React.MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      
      // If sidebar is collapsed, mark that we're navigating to preserve state
      if (isCollapsed) {
        setIsNavigating(true);
        // Ensure the collapsed state is saved before navigation
        localStorage.setItem('sidebarCollapsed', 'true');
      }
      
      router.push(href);
      setIsMobileSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Sidebar content - layout positioning handled by ClientLayout */}
      {isMounted && (
        <>
          <aside className="h-full flex flex-col bg-background border-r shadow-lg">
            {/* Logo / Brand - Fixed at top, same height as the header */}
            <div className="flex items-center h-16 px-4 border-b justify-between flex-shrink-0">
              {isCollapsed ? (
                <div className="w-full flex justify-center items-center">
                  <div className="flex items-center justify-center">
                    <img 
                      src="/clera-favicon copy.png" 
                      alt="Clera" 
                      className="h-8 w-auto"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-full flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <img 
                      src="/clera-logo copy.png" 
                      alt="Clera" 
                      className="h-8 w-auto"
                    />
                  </div>
                  
                  {/* Desktop collapse button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden lg:flex"
                    onClick={toggleCollapse}
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  
                  {/* Mobile close button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    aria-label="Close sidebar"
                  >
                    <X size={16} />
                  </Button>
                </div>
              )}
            </div>

            {/* Navigation - Scrollable middle section */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <nav className="flex-1 overflow-y-auto p-2">
                <ul className="space-y-1">
                  {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const isChatItem = item.name === 'Ask Clera';
                    const highlightChat = isChatItem && sideChatVisible;
                    
                    return (
                      <li key={item.href}>
                        <a 
                          href={item.href}
                          onClick={item.onClick || ((e) => {
                            if (item.href) {
                              handleNavigation(item.href, e);
                            }
                          })}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground",
                            isActive ? "bg-accent text-accent-foreground" : 
                              highlightChat ? "bg-primary/20 text-primary" : "text-muted-foreground",
                            isCollapsed ? "justify-center" : ""
                          )}
                          title={isCollapsed ? `${item.name}${isChatItem ? ' (Double-click for full page)' : ''}` : undefined}
                        >
                          <item.icon size={20} />
                          {!isCollapsed && <span>{item.name}</span>}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {/* Bottom Icons Section - Above the user profile */}
            <div className="flex-shrink-0">
              <div className="space-y-1 p-2">
                {bottomIcons.map((item) => {
                  const isActive = pathname === item.href;
                  
                  return (
                    <Link 
                      key={item.href}
                      href={item.href} 
                      className={cn(
                        "flex items-center py-2 hover:text-primary transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground",
                        isCollapsed ? "justify-center" : "px-3"
                      )}
                      onClick={(e) => {
                        // Use the same navigation handler for bottom icons
                        handleNavigation(item.href, e);
                      }}
                      title={item.name}
                    >
                      <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                        {item.name === 'Account' && (
                          <div className="border border-current rounded-full w-6 h-6 flex items-center justify-center">
                            <User size={14} />
                          </div>
                        )}
                        {item.name === 'Information' && (
                          <div className="border border-current rounded-full w-6 h-6 flex items-center justify-center">
                            <Info size={14} />
                          </div>
                        )}
                        {item.name === 'Settings' && (
                          <Settings size={20} />
                        )}
                      </div>
                      {!isCollapsed && (
                        <span className="ml-3">{item.name}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* User section - Fixed at bottom */}
            <div className="border-t p-4 flex-shrink-0 mt-auto">
              <div className={cn(
                "flex items-center gap-3",
                isCollapsed ? "justify-center" : ""
              )}>
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-muted-foreground" />
                </div>
                {!isCollapsed && (
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate">User Profile</p>
                    <p className="text-xs text-muted-foreground truncate">user@example.com</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
          
          {/* Expand button - when sidebar is collapsed */}
          {isCollapsed && (
            <div className="hidden lg:block fixed top-4 left-24 z-60">
              <Button
                variant="ghost"
                size="icon"
                className="flex items-center justify-center"
                onClick={toggleCollapse}
                aria-label="Expand sidebar"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
} 