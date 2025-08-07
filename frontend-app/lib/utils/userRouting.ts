import { OnboardingStatus } from "@/lib/types/onboarding";

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

/**
 * Enhanced routing function for SERVER-SIDE usage (Server Actions, API routes).
 * ARCHITECTURAL FIX: Centralizes transfer lookup logic with proper server client.
 * 
 * @param userStatus - The user's onboarding status
 * @param userId - The user ID for transfer lookup
 * @param supabaseServerClient - Server-side Supabase client with proper auth context
 * @returns Promise<string> The appropriate redirect path
 */
export async function getRedirectPathWithServerTransferLookup(
  userStatus: OnboardingStatus | undefined, 
  userId: string,
  supabaseServerClient: any
): Promise<string> {
  // Account closure statuses - highest priority (no transfer lookup needed)
  if (userStatus === 'pending_closure') {
    return "/account-closure";
  }
  
  if (userStatus === 'closed') {
    return "/protected"; // For closed accounts that want to restart
  }
  
  // For other statuses, we need to check transfer history
  let hasTransfers = false;
  
  try {
    const { data: transfers, error: transfersError } = await supabaseServerClient
      .from('user_transfers')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    
    // Handle transfer query errors gracefully
    if (transfersError) {
      console.error('Error fetching user transfers for routing:', transfersError);
      // Default to false (no transfers) on error to be conservative
      // This ensures users go to /protected for onboarding/funding rather than /portfolio
      hasTransfers = false;
    } else {
      hasTransfers = Boolean(transfers && transfers.length > 0);
    }
  } catch (error) {
    console.error('Unexpected error during transfer lookup:', error);
    hasTransfers = false; // Conservative fallback
  }
  
  // Use the existing routing logic with the looked-up transfer status
  return getRedirectPathForUserStatus(userStatus, hasTransfers);
}

/**
 * Enhanced routing function for CLIENT-SIDE usage (React components, hooks).
 * Uses browser Supabase client for client-side transfer lookup.
 * 
 * @param userStatus - The user's onboarding status
 * @param userId - The user ID for transfer lookup
 * @returns Promise<string> The appropriate redirect path
 */
export async function getRedirectPathWithClientTransferLookup(
  userStatus: OnboardingStatus | undefined, 
  userId: string
): Promise<string> {
  // Account closure statuses - highest priority (no transfer lookup needed)
  if (userStatus === 'pending_closure') {
    return "/account-closure";
  }
  
  if (userStatus === 'closed') {
    return "/protected"; // For closed accounts that want to restart
  }
  
  // For other statuses, we need to check transfer history
  let hasTransfers = false;
  
  try {
    // Dynamic import to avoid server/client issues
    const { createClient } = await import('@/utils/supabase/client');
    const supabase = createClient();
    
    const { data: transfers, error: transfersError } = await supabase
      .from('user_transfers')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    
    // Handle transfer query errors gracefully
    if (transfersError) {
      console.error('Error fetching user transfers for routing:', transfersError);
      // Default to false (no transfers) on error to be conservative
      hasTransfers = false;
    } else {
      hasTransfers = Boolean(transfers && transfers.length > 0);
    }
  } catch (error) {
    console.error('Unexpected error during transfer lookup:', error);
    hasTransfers = false; // Conservative fallback
  }
  
  // Use the existing routing logic with the looked-up transfer status
  return getRedirectPathForUserStatus(userStatus, hasTransfers);
} 