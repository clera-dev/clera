"use client";

import { usePathname } from "next/navigation";

interface MainContentProps {
  children: React.ReactNode;
}

/**
 * Main content wrapper that conditionally adds top padding
 * Only adds padding on dashboard page where header is shown
 */
export default function MainContent({ children }: MainContentProps) {
  const pathname = usePathname();
  
  // Only add top padding on dashboard where header is shown
  const shouldHaveHeaderPadding = pathname === '/dashboard';
  
  return (
    <main className={`flex-1 w-full flex flex-col ${shouldHaveHeaderPadding ? 'pt-10 sm:pt-16' : ''}`}>
      {children}
    </main>
  );
}