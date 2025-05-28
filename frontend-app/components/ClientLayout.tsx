"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import MainSidebar from "@/components/MainSidebar";
import { createClient } from "@/utils/supabase/client";
import SideBySideLayout from "./SideBySideLayout";
import FooterComponent from "@/components/FooterComponent";
import { CleraAssistProvider } from "@/components/ui/clera-assist-provider";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      const storedState = localStorage.getItem('sidebarCollapsed');
      setIsSidebarCollapsed(storedState === 'true');
      
      // Listen for changes to the collapsed state
      const handleStorageChange = () => {
        const updatedState = localStorage.getItem('sidebarCollapsed');
        setIsSidebarCollapsed(updatedState === 'true');
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      // Custom event for changes within the same window
      window.addEventListener('sidebarCollapsedChange', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('sidebarCollapsedChange', handleStorageChange);
      };
    }
  }, []);

  // Check or reset the side chat state when path changes
  useEffect(() => {
    // Close side chat when navigating away from supported pages
    if (!sideChatEnabledPaths.includes(pathname || '')) {
      setIsSideChatOpen(false);
    }
  }, [pathname]);

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
          
          // Store in localStorage for quicker access in future
          localStorage.setItem("userId", user.id);
          localStorage.setItem("onboardingStatus", status || 'not_started');
          
          setHasCompletedOnboarding(completed);
        } else {
          // Clear localStorage if not logged in
          localStorage.removeItem("userId");
          localStorage.removeItem("onboardingStatus");
          setHasCompletedOnboarding(false);
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

  // Don't show sidebar during onboarding or while loading
  const isOnboardingPage = pathname === '/protected' && !hasCompletedOnboarding;
  
  const shouldShowSidebar = 
    isClient && 
    !isLoading && 
    isAuthenticated && 
    pathname !== null && 
    !nonSidebarPaths.includes(pathname) && 
    !isOnboardingPage;

  // Check if current path supports side chat
  const canShowSideChat = sideChatEnabledPaths.includes(pathname || '');

  return (
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
        <div className="flex h-screen">
        {/* Hidden spacer div that takes up space but doesn't show content */}
        {shouldShowSidebar && (
          <div className={`h-full transition-all duration-300 ease-in-out invisible ${isSidebarCollapsed ? 'w-20' : 'w-64'}`} />
        )}
        
        {/* Main content area - adjusted to account for sidebar width */}
        <main className={`flex-1 overflow-hidden relative ${shouldShowSidebar ? 'ml-0' : ''}`}>
          <div className="h-16"></div> {/* Spacer for fixed header */}
          <div className="h-[calc(100%-64px)] overflow-auto">
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
        
        {/* Actual sidebar component - now with fixed positioning */}
        {shouldShowSidebar && (
          <div className={`fixed left-0 top-0 bottom-0 transition-all duration-300 ease-in-out z-55 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
            <MainSidebar 
              isMobileSidebarOpen={isMobileSidebarOpen} 
              setIsMobileSidebarOpen={setIsMobileSidebarOpen}
              onToggleSideChat={canShowSideChat ? toggleSideChat : undefined}
              sideChatVisible={isSideChatOpen}
            />
          </div>
        )}
        </div>
      </CleraAssistProvider>
    </ThemeProvider>
  );
} 