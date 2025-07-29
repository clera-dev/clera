"use client";

import { useRouter } from "next/navigation";

/**
 * Get the intended redirect URL from cookies after onboarding is complete
 */
export function getIntendedRedirect(): string {
  if (typeof document === 'undefined') return '/portfolio';
  
  // Get the redirect cookie
  const cookies = document.cookie.split(';');
  const redirectCookie = cookies.find(cookie => cookie.trim().startsWith('intended_redirect='));
  
  if (redirectCookie) {
    // Extract the intended URL
    const intendedUrl = redirectCookie.split('=')[1];
    
    // Clear the cookie
    document.cookie = 'intended_redirect=; Path=/; Max-Age=0; SameSite=Strict';
    
    return intendedUrl;
  }
  
  // Default redirect if no intended URL was stored
  return '/portfolio';
}

/**
 * Clears the intended_redirect cookie after it has been used.
 */
export function clearIntendedRedirectCookie(): void {
  if (typeof document !== 'undefined') {
    document.cookie = 'intended_redirect=; Path=/; Max-Age=0; SameSite=Strict';
  }
}

/**
 * Hook for handling post-onboarding navigation with proper redirect handling
 */
export function usePostOnboardingNavigation() {
  const router = useRouter();
  
  const navigateAfterOnboarding = (isNewUser: boolean = false) => {
    // First, check if there's an intended redirect cookie
    const intendedRedirect = getIntendedRedirect();
    
    // If there was an intended redirect, use it (regardless of new user status)
    if (intendedRedirect && intendedRedirect !== '/portfolio') {
      router.push(intendedRedirect);
      return;
    }
    
    // If no intended redirect, use the default logic based on user type
    if (isNewUser) {
      // New users who just completed onboarding should go to /invest
      router.push('/invest');
    } else {
      // Existing users should go to /portfolio
      router.push('/portfolio');
    }
  };
  
  return { navigateAfterOnboarding };
} 