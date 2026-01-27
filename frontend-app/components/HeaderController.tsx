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
  // CRITICAL: Use exact matches to prevent header showing on all pages
  // NOTE: Landing page ('/') has its own navbar, so it's excluded
  const authPages = [
    '/sign-in',        // Sign in page (exact match)
    '/sign-up',        // Sign up page (exact match)
    '/forgot-password', // Password reset page (exact match)
    '/dashboard'       // User dashboard (exact match)
  ];
  
  // Use exact path matching to prevent header from showing on protected pages
  const shouldShowHeader = authPages.includes(pathname);
  
  if (!shouldShowHeader) {
    return null;
  }
  
  return <>{children}</>;
} 