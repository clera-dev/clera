import { unstable_noStore as noStore } from 'next/cache';
import { NextResponse } from "next/server";
import { AUTH_ROUTES } from '@/lib/constants';

export interface RouteConfig {
  requiresAuth: boolean;
  requiresOnboarding: boolean;
  requiresFunding: boolean;
  requiresPayment: boolean;  // NEW: Requires active Stripe subscription
  allowedDuringOnboarding?: boolean;
  requiredRole: string;
}

// Configuration for protected routes
// NOTE: requiresPayment = true means user must have active Stripe subscription
// IMPORTANT: /dashboard has requiresPayment: false so users can ALWAYS access subscription management
// even when their subscription has lapsed. This prevents lockout scenarios.
export const routeConfigs: Record<string, RouteConfig> = {
  "/protected": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/dashboard": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/invest": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/portfolio": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/news": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/settings": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/info": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/chat": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/account-closure": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  
  // Funding page (replaces modal flow)
  "/account/add-funds": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },

  // API routes - Payment required for core app functionality
  "/api/broker/account-summary": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/broker/bank-status": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/broker/connect-bank": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/broker/connect-bank-manual": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/broker/create-account": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/broker/transfer": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/broker/funding-status": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/broker/delete-ach-relationship": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  
  // Portfolio API routes - require payment for core functionality
  "/api/portfolio/history": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/portfolio/positions": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/portfolio/connection-status": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/portfolio/value": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/portfolio/aggregated": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/portfolio/analytics": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  
  // Conversation API routes - require payment for AI chat
  "/api/conversations/create-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/get-sessions": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/get-thread-messages": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/update-thread-title": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/delete-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/stream-chat": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/submit-message": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  "/api/conversations/handle-interrupt": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  
  // FMP API routes - require authentication to prevent abuse (authenticated users have natural rate limiting)
  "/api/fmp/chart": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/fmp/profile": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/fmp/price-target": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/fmp/chart/health": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  
  // Image proxy route - require authentication to prevent bandwidth abuse
  "/api/image-proxy": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },

  // Cron routes - secured via CRON_SECRET header, should not require user auth
  "/api/cron": { requiresAuth: false, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "system" },
  
  // News API routes - public cached data, no auth required
  "/api/news/watchlist": { requiresAuth: false, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "public" },
  "/api/news/trending": { requiresAuth: false, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "public" },
  "/api/news/portfolio-summary": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: true, requiredRole: "user" },
  
  // Stripe routes - allow access for subscription management even without active payment
  "/api/stripe/check-payment-status": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/stripe/create-portal-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
  "/api/stripe/create-checkout-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiresPayment: false, requiredRole: "user" },
};

export const getRouteConfig = (path: string): RouteConfig | null => {
  // Handle null/undefined/empty path inputs
  if (!path || typeof path !== 'string') {
    return null;
  }
  
  // First try exact match
  const exactMatch = routeConfigs[path];
  if (exactMatch) {
    return exactMatch;
  }
  
  // For API routes, try prefix matching to handle dynamic segments
  // Use longest match to ensure most specific route is selected
  if (path.startsWith('/api/')) {
    let longestMatch: string | null = null;
    let longestLength = 0;
    
    for (const configPath of Object.keys(routeConfigs)) {
      if (configPath.startsWith('/api/') && (path === configPath || path.startsWith(`${configPath}/`))) {
        // Check if this is a longer (more specific) match
        if (configPath.length > longestLength) {
          longestMatch = configPath;
          longestLength = configPath.length;
        }
      }
    }
    
    if (longestMatch) {
      return routeConfigs[longestMatch];
    }
  }
  
  return null;
};

export function isPublicPath(path: string): boolean {
  const publicPaths = [
    '/auth/callback', 
    '/auth/confirm', 
    '/protected/reset-password', 
    '/ingest',
    '/.well-known',
    ...AUTH_ROUTES
  ];
  
  return publicPaths.some(publicPath => path.startsWith(publicPath));
}

export function isAuthPage(path: string): boolean {
  return AUTH_ROUTES.some(authPage => path.startsWith(authPage));
}

// Real-time onboarding status check - no caching for critical user flows
export async function getOnboardingStatus(supabase: any, userId: string): Promise<string | null> {
  try {
    // Force no caching for critical user flow data (Next.js 15.3.3 fix)
    noStore();
        
    // Force fresh query by adding a timestamp parameter to bust any server-side caching
    const { data: onboardingData, error } = await supabase
      .from('user_onboarding')
      .select('status')
      .eq('user_id', userId)
      .limit(1)
      .single();
    
    if (error) {
      // GRACEFUL HANDLING: If no row is found, it simply means the user hasn't started onboarding.
      // This is an expected state for new users, not an error.
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Onboarding status check error:', error);
      return null;
    }
    
    const status = onboardingData?.status || null;
    
    return status;
  } catch (error) {
    console.error('Database error checking onboarding status:', error);
    return null;
  }
}

export function hasCompletedOnboarding(status: string | null): boolean {
  const completed = status === 'submitted' || status === 'approved';
  return completed;
}

export function isPendingClosure(status: string | null): boolean {
  return status === 'pending_closure';
}

export function isAccountClosed(status: string | null): boolean {
  return status === 'closed';
}

export function shouldRestartOnboarding(status: string | null): boolean {
  return status === 'closed';
}

// Get Alpaca account ID for a user
export async function getAlpacaAccountId(supabase: any, userId: string): Promise<string | null> {
  try {
    noStore();
    
    const { data: accountData, error } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', userId)
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching Alpaca account ID:', error);
      return null;
    }
    
    return accountData?.alpaca_account_id || null;
  } catch (error) {
    console.error('Database error fetching Alpaca account ID:', error);
    return null;
  }
}

// Real-time funding status check for ALPACA USERS ONLY - no caching for critical user flows
// NOTE: This should only be called for users in brokerage/hybrid mode with Alpaca accounts
// SnapTrade and Plaid users don't need "funding" - they have external accounts
export async function getFundingStatus(supabase: any, userId: string): Promise<boolean> {
  try {
    // Force no caching for critical user flow data (Next.js 15.3.3 fix)
    noStore();
    
    // Get user's Alpaca account ID
    const alpacaAccountId = await getAlpacaAccountId(supabase, userId);
    if (!alpacaAccountId) {
      console.log(`[Middleware] No Alpaca account found for user - skipping funding check`);
      return false;
    }
    
    // Call the funding status API endpoint
    try {
      const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
      const apiKey = process.env.BACKEND_API_KEY;
      
      if (!apiKey) {
        console.error('[Middleware] BACKEND_API_KEY not found');
        return false;
      }

      const response = await fetch(`${backendUrl}/api/account/${alpacaAccountId}/funding-status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      });

      if (!response.ok) {
        console.error(`[Middleware] Funding status API error: ${response.status}`);
        return false;
      }

      const responseData = await response.json();
      const isFunded = responseData?.data?.is_funded || false;
      
      // Sensitive funding details removed from logs for security
      
      return isFunded;
    } catch (apiError) {
      console.error('[Middleware] Error calling funding status API:', apiError);
      
      // Fallback to Supabase transfer check
      console.log('[Middleware] Falling back to Supabase transfer check');
      const { data: transfers, error } = await supabase
        .from('user_transfers')
        .select('amount, status')
        .eq('user_id', userId)
        .gte('amount', 1); // Must be at least $1
      
      if (error) {
        console.error('Funding status check error:', error);
        return false;
      }
      
      // Check if there's at least one successful transfer
      const hasFunding = transfers && transfers.length > 0 && 
        transfers.some((transfer: any) => 
          transfer.status === 'QUEUED' ||
          transfer.status === 'SUBMITTED' ||
          transfer.status === 'COMPLETED' || 
          transfer.status === 'SETTLED'
        );
      
      return !!hasFunding;
    }
  } catch (error) {
    console.error('Database error checking funding status:', error);
    return false;
  }
}

export function hasCompletedFunding(fundingStatus: boolean): boolean {
  return fundingStatus;
}

// Check if user has ANY connected portfolio accounts (SnapTrade, Plaid, or funded Alpaca)
// This is the production-grade way to determine if user should have access to main app
export async function hasConnectedAccounts(supabase: any, userId: string): Promise<boolean> {
  try {
    noStore();
    
    // Check 1: SnapTrade connections (trade or read-only)
    try {
      const { data: snaptradeConnections, error: snaptradeError } = await supabase
        .from('snaptrade_brokerage_connections')
        .select('authorization_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1);
      
      if (!snaptradeError && snaptradeConnections && snaptradeConnections.length > 0) {
        console.log(`[Middleware] User has active SnapTrade connection`);
        return true;
      }
    } catch (snaptradeError) {
      console.log('[Middleware] SnapTrade check failed, continuing...');
    }
    
    // Check 2: Plaid investment accounts
    try {
      const { data: plaidAccounts, error: plaidError } = await supabase
        .from('user_investment_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'plaid')
        .eq('is_active', true)
        .limit(1);
      
      if (!plaidError && plaidAccounts && plaidAccounts.length > 0) {
        console.log(`[Middleware] User has active Plaid accounts`);
        return true;
      }
    } catch (plaidError) {
      console.log('[Middleware] Plaid check failed, continuing...');
    }
    
    // Check 3: Funded Alpaca account (only if they have an Alpaca account)
    const alpacaAccountId = await getAlpacaAccountId(supabase, userId);
    if (alpacaAccountId) {
      const fundingStatus = await getFundingStatus(supabase, userId);
      if (fundingStatus) {
        console.log(`[Middleware] User has funded Alpaca account`);
        return true;
      }
    }
    
    console.log(`[Middleware] User has no connected accounts`);
    return false;
    
  } catch (error) {
    console.error('[Middleware] Error checking connected accounts:', error);
    return false;
  }
}

// Check if user has active payment (Stripe subscription)
// This is used by middleware to enforce payment requirements
export async function hasActivePayment(supabase: any, userId: string): Promise<boolean> {
  try {
    noStore();
    
    const { data: paymentRecord, error } = await supabase
      .from('user_payments')
      .select('payment_status, subscription_status')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) {
      // No payment record found - user hasn't paid
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error('Payment status check error:', error);
      return false;
    }
    
    if (!paymentRecord) {
      return false;
    }
    
    // Check if subscription is active or trialing
    const isActive = 
      paymentRecord.payment_status === 'active' ||
      paymentRecord.subscription_status === 'active' ||
      paymentRecord.subscription_status === 'trialing';
    
    return isActive;
  } catch (error) {
    console.error('Database error checking payment status:', error);
    return false;
  }
}

// CommonJS exports for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRouteConfig,
    isPublicPath,
    isAuthPage,
    getOnboardingStatus,
    hasCompletedOnboarding,
    getFundingStatus,
    hasCompletedFunding,
    hasActivePayment,
    routeConfigs
  };
} 