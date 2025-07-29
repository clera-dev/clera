import { unstable_noStore as noStore } from 'next/cache';
import { NextResponse } from "next/server";
import { AUTH_ROUTES } from '@/lib/constants';

export interface RouteConfig {
  requiresAuth: boolean;
  requiresOnboarding: boolean;
  requiresFunding: boolean;
  allowedDuringOnboarding?: boolean;
  requiredRole: string;
}

// Configuration for protected routes
export const routeConfigs: Record<string, RouteConfig> = {
  "/protected": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/dashboard": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/invest": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/portfolio": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/news": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/settings": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/info": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/chat": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },

  // API routes
  "/api/broker/account-summary": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/broker/bank-status": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/broker/connect-bank": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/broker/connect-bank-manual": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/broker/create-account": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/broker/transfer": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/broker/funding-status": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/broker/delete-ach-relationship": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/portfolio/history": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  "/api/portfolio/positions": { requiresAuth: true, requiresOnboarding: true, requiresFunding: false, requiredRole: "user" },
  
  // Conversation API routes - require auth but not onboarding for basic chat functionality
  "/api/conversations/create-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/get-sessions": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/get-thread-messages": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/update-thread-title": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/delete-session": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/stream-chat": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/submit-message": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
  "/api/conversations/handle-interrupt": { requiresAuth: true, requiresOnboarding: false, requiresFunding: false, requiredRole: "user" },
};

export const getRouteConfig = (path: string): RouteConfig | null => {
  return routeConfigs[path] || null;
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

// Real-time funding status check using Alpaca API - no caching for critical user flows  
export async function getFundingStatus(supabase: any, userId: string): Promise<boolean> {
  try {
    // Force no caching for critical user flow data (Next.js 15.3.3 fix)
    noStore();
    
    
    // Get user's Alpaca account ID
    const alpacaAccountId = await getAlpacaAccountId(supabase, userId);
    if (!alpacaAccountId) {
      console.log(`[Middleware] No Alpaca account found for user`);
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
    routeConfigs
  };
} 