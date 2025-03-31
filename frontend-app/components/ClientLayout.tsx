"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import MainSidebar from "@/components/MainSidebar";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);

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
    setIsClient(true);
    // Check if user is authenticated based on localStorage
    try {
      const userId = localStorage.getItem("userId");
      setIsAuthenticated(!!userId);
    } catch (error) {
      console.error("Error accessing localStorage:", error);
    }
  }, []);

  const shouldShowSidebar = isClient && isAuthenticated && !nonSidebarPaths.includes(pathname);

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
        <main className={`flex-1 ${shouldShowSidebar ? "lg:ml-64" : ""}`}>
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
} 