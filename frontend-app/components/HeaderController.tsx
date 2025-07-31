"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface HeaderControllerProps {
  children: React.ReactNode;
}

/**
 * Controller for the header navigation
 * Only show the header with sign out button on the dashboard page
 * Other pages get more screen real estate without the header
 */
export default function HeaderController({ children }: HeaderControllerProps) {
  const pathname = usePathname();
  
  // Only show header on dashboard page where users manage their account
  const shouldShowHeader = pathname === '/dashboard';
  
  if (!shouldShowHeader) {
    return null;
  }
  
  return <>{children}</>;
} 