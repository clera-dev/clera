"use client";

import { usePathname } from "next/navigation";

interface MainContentProps {
  children: React.ReactNode;
}

/**
 * Main content wrapper that conditionally adds top padding
 * Adds padding on auth pages and dashboard where header is shown
 */
export default function MainContent({ children }: MainContentProps) {
  const pathname = usePathname();
  
  // Pages that have the auth header (should match HeaderController logic)
  const authPages = [
    '/',               // Landing page
    '/sign-in',        // Sign in page
    '/sign-up',        // Sign up page  
    '/forgot-password', // Password reset page
    '/dashboard'       // User dashboard
  ];
  
  const shouldHaveHeaderPadding = authPages.includes(pathname);
  
  return (
    <main className={`flex-1 w-full flex flex-col ${shouldHaveHeaderPadding ? 'pt-10 sm:pt-16' : ''}`}>
      {children}
    </main>
  );
}