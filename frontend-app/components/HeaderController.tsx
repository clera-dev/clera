"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface HeaderControllerProps {
  children: React.ReactNode;
}

/**
 * Controller for the header navigation
 * We always want to show the header with the Clera logo and sign out button,
 * even during onboarding
 */
export default function HeaderController({ children }: HeaderControllerProps) {
  // Always show the header/top navigation bar 
  // (the sidebar is controlled separately in ClientLayout)
  return <>{children}</>;
} 