import { OnboardingStatus } from "@/app/actions";

/**
 * Single source of truth for user status-based routing.
 * Centralizes all routing logic to prevent inconsistencies between sign-in and sign-up flows.
 * 
 * This function implements the business rules for user navigation based on their onboarding status:
 * - pending_closure users → /account-closure (dedicated closure page)
 * - closed users → /protected (can restart account)
 * - completed onboarding + funded → /portfolio (main app)
 * - default → /protected (onboarding or funding)
 * 
 * @param userStatus - The user's onboarding status
 * @param hasTransfers - Whether the user has funded their account
 * @returns The appropriate redirect path based on user status
 */
export function getRedirectPathForUserStatus(userStatus: OnboardingStatus | undefined, hasTransfers: boolean = false): string {
  // Account closure statuses - highest priority
  if (userStatus === 'pending_closure') {
    return "/account-closure";
  }
  
  if (userStatus === 'closed') {
    return "/protected"; // For closed accounts that want to restart
  }
  
  // Completed onboarding with funding
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
  if (hasCompletedOnboarding && hasTransfers) {
    return "/portfolio";
  }
  
  // Default: protected page for onboarding or funding
  return "/protected";
} 