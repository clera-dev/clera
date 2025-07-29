"use client";

import { usePathname } from 'next/navigation';
import LogoLink from '@/components/LogoLink';
import { useUserOnboardingStatus } from '@/hooks/useUserOnboardingStatus';
import { AUTH_ROUTES } from '@/lib/constants';

export default function ConditionalLogoLink() {
  const pathname = usePathname();
  
  // Auth pages where users are not authenticated
  const authPages = AUTH_ROUTES;

  // For auth pages, we can show the logo immediately without waiting for status
  const isAuthPage = authPages.includes(pathname);
  
  // Use the hook with skipAuthCheck for auth pages
  const { status: userStatus, isLoading, error } = useUserOnboardingStatus({
    skipAuthCheck: isAuthPage
  });
  
  // Pages where we don't want to show the logo (except for special cases)
  const hideLogoPages = ['/dashboard', '/account', '/chat', '/invest', '/portfolio', '/news', '/info', '/settings', '/protected'];
  
  // Check if current path starts with any of the paths where we don't want to show the logo
  const shouldHideLogoBasedOnPath = hideLogoPages.some(page => pathname?.startsWith(page));
  
  // Special case: Always show logo for users with pending_closure or closed status on /protected
  const isAccountClosurePage = pathname?.startsWith('/protected') && (userStatus === 'pending_closure' || userStatus === 'closed');
  
  // Show logo if:
  // 1. Path is not in hide list, OR
  // 2. User is on account closure page (pending_closure/closed status on /protected)
  const shouldShowLogo = !shouldHideLogoBasedOnPath || isAccountClosurePage;
  
  // On auth pages, show logo immediately without waiting for auth status
  if (isAuthPage) {
    return <LogoLink />;
  }
  
  // For other pages, wait for loading to complete and check if we should show logo
  if (isLoading || !shouldShowLogo) {
    return null;
  }
  
  return <LogoLink />;
} 