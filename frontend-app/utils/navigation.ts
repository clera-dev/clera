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

/**
 * Validates that a redirect URL is safe and same-origin
 * @param url The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Must start with '/' to be a relative path
  if (!url.startsWith('/')) {
    return false;
  }
  
  // Prevent directory traversal attacks
  if (url.includes('..') || url.includes('//')) {
    return false;
  }
  
  // Prevent URL encoding attacks
  if (url.includes('%') || url.includes('\\')) {
    return false;
  }
  
  // Only allow safe paths within the application
  const allowedPaths = [
    '/dashboard',
    '/portfolio', 
    '/invest',
    '/news',
    '/chat',
    '/settings',
    '/account',
    '/info'
  ];
  
  // Check if the URL starts with any allowed path
  const isAllowedPath = allowedPaths.some(path => url.startsWith(path));
  
  // Additional safety: ensure it's not trying to access sensitive routes
  const blockedPatterns = [
    '/api/',
    '/_next/',
    '/admin/',
    '/internal/',
    '/debug/',
    '/test/',
    '/protected/',
    '/auth/'
  ];
  
  const isBlockedPath = blockedPatterns.some(pattern => url.startsWith(pattern));
  
  return isAllowedPath && !isBlockedPath;
}

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