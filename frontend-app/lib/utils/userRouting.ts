import { OnboardingStatus } from "@/lib/types/onboarding";

/**
 * Single source of truth for user status-based routing.
 * Centralizes all routing logic to prevent inconsistencies between sign-in and sign-up flows.
 * 
 * This function implements the business rules for user navigation based on their onboarding status:
 * - pending_closure users → /account-closure (dedicated closure page)
 * - closed users → /protected (can restart account)
 * - completed onboarding + (connected accounts OR funded) + active payment → /portfolio (main app)
 * - default → /protected (onboarding, connection, or payment)
 * 
 * @param userStatus - The user's onboarding status
 * @param hasAccountsOrFunding - Whether the user has connected accounts or funded their account
 * @param hasActivePayment - Whether the user has an active payment subscription
 * @returns The appropriate redirect path based on user status
 */
export function getRedirectPathForUserStatus(
  userStatus: OnboardingStatus | undefined, 
  hasAccountsOrFunding: boolean = false,
  hasActivePayment: boolean = false
): string {
  // Account closure statuses - highest priority
  if (userStatus === 'pending_closure') {
    return "/account-closure";
  }
  
  if (userStatus === 'closed') {
    return "/protected"; // For closed accounts that want to restart
  }
  
  // Completed onboarding with accounts/funding AND payment
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
  if (hasCompletedOnboarding && hasAccountsOrFunding && hasActivePayment) {
    return "/portfolio";
  }
  
  // Default: protected page for onboarding, connection, or payment
  return "/protected";
}

/**
 * Enhanced routing function for SERVER-SIDE usage (Server Actions, API routes).
 * ARCHITECTURAL FIX: Centralizes transfer lookup logic with proper server client.
 * 
 * Now also checks for SnapTrade/Plaid connected accounts AND payment status.
 * Users with completed onboarding + connected accounts + active payment → /portfolio
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
  
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
  
  // Only do additional checks if onboarding is complete
  if (!hasCompletedOnboarding) {
    return "/protected";
  }
  
  // Check for connected accounts (SnapTrade, Plaid) AND payment status
  // NOTE: Alpaca funding is paused - we're only using SnapTrade currently
  let hasSnapTradeAccounts = false;
  let hasPlaidAccounts = false;
  let hasActivePayment = false;
  
  try {
    // Run all checks in parallel for performance
    const [snaptradeResult, plaidResult, paymentResult] = await Promise.all([
      // Check SnapTrade connections (primary - this is what we use)
      supabaseServerClient
        .from('snaptrade_brokerage_connections')
        .select('authorization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1),
      // Check Plaid connected accounts (secondary)
      supabaseServerClient
        .from('user_investment_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1),
      // Check active payment subscription
      supabaseServerClient
        .from('user_payments')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .limit(1)
    ]);
    
    // Process SnapTrade result (primary check)
    if (!snaptradeResult.error && snaptradeResult.data) {
      hasSnapTradeAccounts = snaptradeResult.data.length > 0;
    }
    
    // Process Plaid result
    if (!plaidResult.error && plaidResult.data) {
      hasPlaidAccounts = plaidResult.data.length > 0;
    }
    
    // Process payment result
    if (!paymentResult.error && paymentResult.data) {
      hasActivePayment = paymentResult.data.length > 0;
    }
    
  } catch (error) {
    console.error('Unexpected error during routing lookup:', error);
    // Conservative fallback - go to /protected
    return "/protected";
  }
  
  // User can access portfolio if they have:
  // 1. Completed onboarding AND
  // 2. Connected accounts (SnapTrade or Plaid) AND
  // 3. Active payment subscription
  const hasConnectedAccounts = hasSnapTradeAccounts || hasPlaidAccounts;
  
  if (hasCompletedOnboarding && hasConnectedAccounts && hasActivePayment) {
    return "/portfolio";
  }
  
  // Default: protected page for onboarding, connection, or payment
  return "/protected";
}

/**
 * Enhanced routing function for CLIENT-SIDE usage (React components, hooks).
 * Uses browser Supabase client for client-side lookups.
 * 
 * Now also checks for SnapTrade/Plaid connected accounts AND payment status.
 * 
 * @param userStatus - The user's onboarding status
 * @param userId - The user ID for lookups
 * @returns Promise<string> The appropriate redirect path
 */
export async function getRedirectPathWithClientTransferLookup(
  userStatus: OnboardingStatus | undefined, 
  userId: string
): Promise<string> {
  // Account closure statuses - highest priority (no lookup needed)
  if (userStatus === 'pending_closure') {
    return "/account-closure";
  }
  
  if (userStatus === 'closed') {
    return "/protected"; // For closed accounts that want to restart
  }
  
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
  
  // Only do additional checks if onboarding is complete
  if (!hasCompletedOnboarding) {
    return "/protected";
  }
  
  // Check for connected accounts (SnapTrade, Plaid) and payment status
  // NOTE: Alpaca funding is paused - we're only using SnapTrade currently
  let hasSnapTradeAccounts = false;
  let hasPlaidAccounts = false;
  let hasActivePayment = false;
  
  try {
    // Dynamic import to avoid server/client issues
    const { createClient } = await import('@/utils/supabase/client');
    const supabase = createClient();
    
    // Run all checks in parallel for performance
    const [snaptradeResult, plaidResult, paymentResult] = await Promise.all([
      // Check SnapTrade connections (primary - this is what we use)
      supabase
        .from('snaptrade_brokerage_connections')
        .select('authorization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1),
      // Check Plaid connected accounts (secondary)
      supabase
        .from('user_investment_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1),
      // Check active payment subscription
      supabase
        .from('user_payments')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .limit(1)
    ]);
    
    // Process results
    if (!snaptradeResult.error && snaptradeResult.data) {
      hasSnapTradeAccounts = snaptradeResult.data.length > 0;
    }
    if (!plaidResult.error && plaidResult.data) {
      hasPlaidAccounts = plaidResult.data.length > 0;
    }
    if (!paymentResult.error && paymentResult.data) {
      hasActivePayment = paymentResult.data.length > 0;
    }
    
  } catch (error) {
    console.error('Unexpected error during routing lookup:', error);
    return "/protected"; // Conservative fallback
  }
  
  // Use the existing routing logic
  const hasConnectedAccounts = hasSnapTradeAccounts || hasPlaidAccounts;
  return getRedirectPathForUserStatus(userStatus, hasConnectedAccounts, hasActivePayment);
} 