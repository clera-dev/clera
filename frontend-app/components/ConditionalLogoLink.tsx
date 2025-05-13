"use client";

import { usePathname } from 'next/navigation';
import LogoLink from '@/components/LogoLink';

export default function ConditionalLogoLink() {
  const pathname = usePathname();
  // Pages where we don't want to show the second logo
  const hideLogoPages = ['/dashboard', '/chat', '/invest', '/portfolio', '/news'];
  
  // Check if current path starts with any of the paths where we don't want to show the logo
  const shouldShowLogo = !hideLogoPages.some(page => pathname?.startsWith(page));
  
  if (!shouldShowLogo) {
    return null;
  }
  
  return <LogoLink />;
} 