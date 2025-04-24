"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import MainSidebar from "@/components/MainSidebar";
import { createClient } from "@/utils/supabase/client";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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

  // Don't show sidebar during onboarding or while loading
  const isOnboardingPage = pathname === '/protected' && !hasCompletedOnboarding;
  
  const shouldShowSidebar = 
    isClient && 
    !isLoading && 
    isAuthenticated && 
    !nonSidebarPaths.includes(pathname) && 
    !isOnboardingPage;

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="flex min-h-screen">
        {shouldShowSidebar && (
          <MainSidebar 
            isMobileSidebarOpen={isMobileSidebarOpen} 
            setIsMobileSidebarOpen={setIsMobileSidebarOpen} 
          />
        )}
        <main className="flex-1 w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
} 