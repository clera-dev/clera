"use client";

import React, { useState, useEffect, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import MainSidebar from "@/components/MainSidebar";
import { createClient } from "@/utils/supabase/client";
import SideBySideLayout from "./SideBySideLayout";
import FooterComponent from "@/components/FooterComponent";
import { CleraAssistProvider } from "@/components/ui/clera-assist-provider";
import { Button } from "@/components/ui/button";
import { Menu, ChevronLeft } from "lucide-react";
import { useAccountClosure } from "@/hooks/useAccountClosure";

interface ClientLayoutProps {
  children: React.ReactNode;
}

// Create a context for sidebar collapse functionality
interface SidebarContextType {
  autoCollapseSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export const useSidebarCollapse = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    return { autoCollapseSidebar: () => {} }; // No-op if context not available
  }
  return context;
};

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [hasCompletedFunding, setHasCompletedFunding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get account closure state from backend (authoritative source)
  const { closureData, loading: closureLoading } = useAccountClosure();

  // Paths that don't need the sidebar
  const nonSidebarPaths = [
    "/",
    "/sign-in",
    "/sign-up",
    "/auth/callback",
    "/auth/confirm",
    "/protected/reset-password",
  ];
  
  // Paths that can have the sidebar chat
  const sideChatEnabledPaths = [
    "/portfolio",
    "/invest",
    "/news"
  ];
  
  // Check the sidebar collapsed state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Immediately get the initial state to prevent layout shift
      const storedState = localStorage.getItem('sidebarCollapsed');
      const initialCollapsed = storedState === 'true';
      setIsSidebarCollapsed(initialCollapsed);
      
      // Listen for changes to the collapsed state
      const handleStorageChange = () => {
        const updatedState = localStorage.getItem('sidebarCollapsed');
        setIsSidebarCollapsed(updatedState === 'true');
      };
      
      // Handle storage events from other tabs/windows
      window.addEventListener('storage', handleStorageChange);
      
      // Custom event for changes within the same window
      window.addEventListener('sidebarCollapsedChange', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('sidebarCollapsedChange', handleStorageChange);
      };
    }
  }, []);

  // Additional effect to ensure state consistency during pathname changes
  useEffect(() => {
    // Re-check localStorage state on every pathname change to ensure consistency
    if (typeof window !== 'undefined') {
      const storedState = localStorage.getItem('sidebarCollapsed');
      const shouldBeCollapsed = storedState === 'true';
      
      // Only update if there's a mismatch to prevent unnecessary re-renders
      if (isSidebarCollapsed !== shouldBeCollapsed) {
        setIsSidebarCollapsed(shouldBeCollapsed);
      }
    }
  }, [pathname, isSidebarCollapsed]);

  // Check or reset the side chat state when path changes
  useEffect(() => {
    // Close side chat when navigating away from supported pages
    if (!sideChatEnabledPaths.includes(pathname || '')) {
      setIsSideChatOpen(false);
    }
  }, [pathname]);

  // Close mobile sidebar when screen becomes desktop size
  useEffect(() => {
    const handleResize = () => {
      // Close mobile sidebar on desktop breakpoint (1024px+)
      if (window.innerWidth >= 1024 && isMobileSidebarOpen) {
        setIsMobileSidebarOpen(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    const checkAuthAndOnboarding = async () => {
      setIsClient(true);
      setIsLoading(true);
      
      try {
        // First check Supabase auth status using getUser instead of getSession for security
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        const isLoggedIn = !!user;
        setIsAuthenticated(isLoggedIn);
        
        if (isLoggedIn) {
          // If authenticated, check onboarding status from DB first
          const { data: onboardingData } = await supabase
            .from('user_onboarding')
            .select('status')
            .eq('user_id', user.id)
            .single();
          
          const status = onboardingData?.status;
          const completed = status === 'submitted' || status === 'approved';
          
          // Check if account is in closure process - these users should have NO sidebar access
          const isPendingClosure = status === 'pending_closure';
          const isClosed = status === 'closed';
          
          // Check funding status (but not for closure accounts)
          let funded = false;
          if (completed && !isPendingClosure && !isClosed) {
            const { data: transfers } = await supabase
              .from('user_transfers')
              .select('amount, status')
              .eq('user_id', user.id)
              .gte('amount', 1);
            
            funded = !!(transfers && transfers.length > 0 && 
              transfers.some((transfer: any) => 
                transfer.status === 'QUEUED' ||
                transfer.status === 'SUBMITTED' ||
                transfer.status === 'COMPLETED' || 
                transfer.status === 'SETTLED'
              ));
          }
          
          // Store in localStorage for quicker access in future
          localStorage.setItem("userId", user.id);
          localStorage.setItem("onboardingStatus", status || 'not_started');
          localStorage.setItem("fundingStatus", funded ? 'funded' : 'not_funded');
          localStorage.setItem("isPendingClosure", isPendingClosure.toString());
          localStorage.setItem("isClosed", isClosed.toString());
          
          setHasCompletedOnboarding(completed);
          setHasCompletedFunding(funded);
        } else {
          // Clear localStorage if not logged in
          localStorage.removeItem("userId");
          localStorage.removeItem("onboardingStatus");
          localStorage.removeItem("fundingStatus");
          localStorage.removeItem("isPendingClosure");
          localStorage.removeItem("isClosed");
          setHasCompletedOnboarding(false);
          setHasCompletedFunding(false);
        }
      } catch (error) {
        console.error("Error checking auth/onboarding status:", error);
        
        // Fallback to localStorage if DB check fails
        try {
          const userId = localStorage.getItem("userId");
          setIsAuthenticated(!!userId);
          
          const onboardingStatus = localStorage.getItem("onboardingStatus");
          setHasCompletedOnboarding(
            onboardingStatus === 'submitted' || onboardingStatus === 'approved'
          );
          
          const fundingStatus = localStorage.getItem("fundingStatus");
          setHasCompletedFunding(fundingStatus === 'funded');
        } catch (storageError) {
          console.error("Error accessing localStorage:", storageError);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuthAndOnboarding();
  }, [pathname]); // Re-check on path changes to catch onboarding updates

  const toggleSideChat = () => {
    if (sideChatEnabledPaths.includes(pathname || '')) {
      setIsSideChatOpen(!isSideChatOpen);
    }
  };

  // Don't show sidebar during onboarding, if not funded, or if account is closing/closed
  const isOnboardingPage = pathname === '/protected' && !hasCompletedOnboarding;
  const isFundingPage = pathname === '/protected' && hasCompletedOnboarding && !hasCompletedFunding;
  
  // Determine account closure state from backend data (authoritative source)
  // If closureData exists, it means account closure has been initiated
  // Hide sidebar for any account closure activity (in progress or completed)
  const hasAccountClosureActivity = Boolean(closureData && !closureLoading);
  
  // CRITICAL FIX: Wait for both auth/onboarding AND closure data to load
  // This prevents race conditions where sidebar shows/hides incorrectly
  const isDataLoading = isLoading || closureLoading;
  
  const shouldShowSidebar = 
    isClient && 
    !isDataLoading && // Wait for ALL data to load
    isAuthenticated && 
    pathname !== null && 
    !nonSidebarPaths.includes(pathname) && 
    !isOnboardingPage &&
    !isFundingPage &&
    !hasAccountClosureActivity && // CRITICAL: No sidebar for any account closure activity
    hasCompletedFunding; // Must be funded to see sidebar

  // Check if current path supports side chat
  const canShowSideChat = sideChatEnabledPaths.includes(pathname || '');

  // Auto-collapse sidebar function for dialogs
  const autoCollapseSidebar = () => {
    // Close mobile sidebar if open
    if (isMobileSidebarOpen) {
      setIsMobileSidebarOpen(false);
    }
    // Collapse desktop sidebar if not already collapsed
    if (!isSidebarCollapsed) {
      console.log('ClientLayout: Auto-collapsing sidebar, dispatching sidebarCollapsedChange event');
      setIsSidebarCollapsed(true);
      localStorage.setItem('sidebarCollapsed', 'true');
      
      // Dispatch event to notify other components with a small delay to ensure state propagation
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new Event('sidebarCollapsedChange'));
        }, 0);
      }
    }
  };

  return (
    <SidebarContext.Provider value={{ autoCollapseSidebar }}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <CleraAssistProvider
          onToggleSideChat={canShowSideChat ? toggleSideChat : undefined}
          sideChatVisible={isSideChatOpen}
        >
        <div className="flex h-screen relative">
          {/* Mobile hamburger button - OUTSIDE sidebar container so it's always visible */}
          {shouldShowSidebar && !isMobileSidebarOpen && (
            <div className="lg:hidden fixed left-4 top-4 z-40 pointer-events-auto">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="bg-background/80 backdrop-blur-sm border border-border/50 shadow-md hover:bg-background/90"
              >
                <Menu size={24} />
              </Button>
            </div>
          )}
          
          {/* Mobile sidebar overlay/backdrop */}
          {shouldShowSidebar && isMobileSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          
          {/* Hidden spacer div that takes up space but doesn't show content - only on desktop */}
        {shouldShowSidebar && (
            <div className={`h-full transition-all duration-300 ease-in-out invisible hidden lg:block ${isSidebarCollapsed ? 'w-20' : 'w-64'}`} />
        )}
        
        {/* Main content area - adjusted to account for sidebar width */}
        <main className={`flex-1 overflow-hidden relative ${shouldShowSidebar ? 'ml-0' : ''}`}>
          <div className="h-full overflow-auto">
            {canShowSideChat ? (
              <SideBySideLayout 
                isChatOpen={isSideChatOpen} 
                onCloseSideChat={() => setIsSideChatOpen(false)}
              >
                {children}
              </SideBySideLayout>
            ) : (
              children
            )}
          </div>
          
          {/* Only show footer on non-authenticated pages */}
          {!isAuthenticated && !isLoading && <FooterComponent />}
        </main>
        
          {/* Actual sidebar component - improved positioning */}
        {shouldShowSidebar && (
            <div className={`
              fixed left-0 top-0 bottom-0 transition-all duration-300 ease-in-out z-55
              ${isSidebarCollapsed ? 'w-20' : 'w-64'}
              ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
            `}>
            <MainSidebar 
              isMobileSidebarOpen={isMobileSidebarOpen} 
              setIsMobileSidebarOpen={setIsMobileSidebarOpen}
              onToggleSideChat={canShowSideChat ? toggleSideChat : undefined}
              sideChatVisible={isSideChatOpen}
            />
              
              {/* Mobile close handle - attached to sidebar, sticks out to the right */}
              {isMobileSidebarOpen && (
                <div className="lg:hidden absolute top-1/2 -translate-y-1/2 -right-8 z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="h-12 w-8 rounded-l-none rounded-r-lg bg-background/90 backdrop-blur-sm border border-l-0 border-border/50 shadow-lg hover:bg-background/95 flex items-center justify-center"
                    aria-label="Close sidebar"
                  >
                    <ChevronLeft size={20} className="text-muted-foreground" />
                  </Button>
                </div>
              )}
          </div>
        )}
        </div>
      </CleraAssistProvider>
    </ThemeProvider>
    </SidebarContext.Provider>
  );
} 