"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface HeaderControllerProps {
  children: React.ReactNode;
}

/**
 * Controller for the header navigation
 * Show the header on authentication pages (with Clera logo + auth buttons)
 * and on the dashboard page (where users manage their account)
 * Other app pages get more screen real estate without the header
 */
export default function HeaderController({ children }: HeaderControllerProps) {
  const pathname = usePathname();
  
  // Pages that should show the auth header
  const authPages = [
    '/',               // Landing page
    '/sign-in',        // Sign in page
    '/sign-up',        // Sign up page  
    '/forgot-password', // Password reset page
    '/dashboard'       // User dashboard
  ];
  
  const shouldShowHeader = authPages.includes(pathname);
  
  if (!shouldShowHeader) {
    return null;
  }
  
  return <>{children}</>;
} 