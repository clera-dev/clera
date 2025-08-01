/**
 * Navigation Utilities
 * 
 * SECURITY: This module implements protection against open-redirect attacks.
 * All redirect URLs are validated to ensure they are safe, same-origin paths.
 * 
 * Security Features:
 * - URL validation against whitelist of allowed paths
 * - Prevention of directory traversal attacks
 * - Blocking of sensitive routes (API, admin, etc.)
 * - Logging of invalid redirect attempts
 * - Graceful fallback to safe default routes
 * 
 * Allowed redirect paths: /dashboard, /portfolio, /invest, /news, /chat, /settings, /account, /info
 * Blocked patterns: /api/, /_next/, /admin/, /internal/, /debug/, /test/
 */

"use client";

import { useRouter } from "next/navigation";
import { isValidRedirectUrl } from './security';

/**
 * Get the intended redirect URL from cookies after onboarding is complete
 */
export function getIntendedRedirect(): string {
  if (typeof document === 'undefined') return '/portfolio';
  
  // Get the redirect cookie
  const cookies = document.cookie.split(';');
  const redirectCookie = cookies.find(cookie => cookie.trim().startsWith('intended_redirect='));
  
  if (redirectCookie) {
    // Extract and URL-decode the intended URL
    const encodedUrl = redirectCookie.split('=')[1];
    const intendedUrl = decodeURIComponent(encodedUrl);
    
    // Validate the URL before returning it
    if (isValidRedirectUrl(intendedUrl)) {
      // Clear the cookie
      document.cookie = 'intended_redirect=; Path=/; Max-Age=0; SameSite=Strict';
      return intendedUrl;
    } else {
      // If the URL is invalid, clear the cookie and log a warning
      console.warn('[Navigation] Invalid redirect URL detected:', intendedUrl);
      document.cookie = 'intended_redirect=; Path=/; Max-Age=0; SameSite=Strict';
    }
  }
  
  // Default redirect if no intended URL was stored or if URL was invalid
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