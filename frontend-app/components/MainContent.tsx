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
  
  // Pages that have the auth header (should match HeaderController logic exactly)
  const authPages = [
    '/',               // Landing page (exact match)
    '/sign-in',        // Sign in page (exact match)
    '/sign-up',        // Sign up page (exact match)
    '/forgot-password', // Password reset page (exact match)
    '/dashboard'       // User dashboard (exact match)
  ];
  
  // Use exact path matching to match HeaderController behavior
  const shouldHaveHeaderPadding = authPages.includes(pathname);
  
  return (
    <div className={`flex-1 w-full flex flex-col ${shouldHaveHeaderPadding ? 'pt-14 sm:pt-16' : ''}`}>
      {children}
    </div>
  );
}