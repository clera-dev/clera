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
  
  const navigateAfterOnboarding = () => {
    clearIntendedRedirectCookie();
    router.refresh();
  };
  
  return { navigateAfterOnboarding };
} 