"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import SnapTradeConnectionStep from '@/components/onboarding/SnapTradeConnectionStep';
import { getOnboardingDataAction } from '@/app/actions';
import ManualBankEntry from '@/components/funding/ManualBankEntry';

import { Skeleton } from '@/components/ui/skeleton';

type FundingStep = 'welcome' | 'connect-bank';



export default function ProtectedPageClient() {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [fundingStep, setFundingStep] = useState<FundingStep>('welcome');
  // hasFunding: ONLY for Alpaca users who have funded their account
  const [hasFunding, setHasFunding] = useState<boolean>(false);
  // hasConnectedAccounts: For SnapTrade/Plaid users who have connected external brokerages
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState<boolean>(false);
  const [hasActivePayment, setHasActivePayment] = useState<boolean>(false);
  // isRedirectingToCheckout: Prevents double-redirect during Stripe checkout flow
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState<boolean>(false);
  // checkoutFailed: Prevents infinite retry loop - requires manual user action to retry
  const [checkoutFailed, setCheckoutFailed] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portfolioMode, setPortfolioMode] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUser(user);

      const { data: onboarding } = await getOnboardingDataAction(user.id);
      setUserStatus(onboarding?.status || 'not_started');
      setOnboardingData(onboarding);

      if (onboarding?.status === 'submitted' || onboarding?.status === 'approved') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .maybeSingle();
        setProfile(profileData);

        // CRITICAL: Check if user has an active payment FIRST
        // Users who have paid but haven't connected accounts should go to /portfolio
        // where they'll see the "Connect Account" UI, not be stuck on /protected
        try {
          const paymentCheck = await fetch('/api/stripe/check-payment-status');
          if (paymentCheck.ok) {
            const paymentData = await paymentCheck.json();
            if (paymentData.hasActivePayment) {
              console.log('[Protected] User has active payment - allowing access to main app');
              setHasActivePayment(true);
              // Don't redirect here - let the useEffect handle it after loading is complete
            }
          }
        } catch (paymentError) {
          console.error('Error checking payment status:', paymentError);
        }

        // Check if user has ANY connected accounts (SnapTrade, Plaid, or funded Alpaca)
        // CRITICAL: This determines if they have accounts, but NOT if they can access /portfolio
        // Access to /portfolio requires BOTH connected accounts AND active payment
        try {
          const modeResponse = await fetch('/api/portfolio/connection-status');
          if (modeResponse.ok) {
            const modeData = await modeResponse.json();
            const mode = modeData.portfolio_mode || 'aggregation';
            const snaptradeAccounts = modeData.snaptrade_accounts || [];
            const plaidAccounts = modeData.plaid_accounts || [];
            const alpacaAccount = modeData.alpaca_account;
            setPortfolioMode(mode);
            
            // Production-grade check: Does user have ANY connected accounts?
            const hasSnapTrade = snaptradeAccounts.length > 0;
            const hasPlaid = plaidAccounts.length > 0;
            const hasAlpaca = !!alpacaAccount;
            
            if (hasSnapTrade || hasPlaid) {
              // SnapTrade or Plaid users have external accounts
              // NOTE: This does NOT mean they can access /portfolio - they still need payment
              console.log('[Protected] User has connected accounts (SnapTrade or Plaid)');
              setHasConnectedAccounts(true);
              // Do NOT set hasFunding - that's only for Alpaca funding flow
            } else if (hasAlpaca) {
              // Alpaca users need to check actual funding status
              console.log('[Protected] User has Alpaca account - checking funding status');
              const { data: transfers } = await supabase
                .from('user_transfers')
                .select('amount, status')
                .eq('user_id', user.id)
                .gte('amount', 1);
              
              const funded = !!(transfers && transfers.length > 0 && 
                transfers.some((transfer: any) => 
                  transfer.status === 'QUEUED' ||
                  transfer.status === 'SUBMITTED' ||
                  transfer.status === 'COMPLETED' || 
                  transfer.status === 'SETTLED'
                ));
              
              setHasFunding(funded);
              setHasConnectedAccounts(funded); // Alpaca counts as connected only if funded
            } else {
              // No connected accounts - user needs to connect something
              console.log('[Protected] User has no connected accounts - staying on /protected');
              setHasConnectedAccounts(false);
              setHasFunding(false);
            }
          }
        } catch (error) {
          console.error('[Protected] Error fetching connection status:', error);
          // Fallback: Check for SnapTrade connections directly (primary brokerage integration)
          try {
            const { data: snaptradeConnections } = await supabase
              .from('snaptrade_brokerage_connections')
              .select('authorization_id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .limit(1);
            
            const hasAccounts = !!(snaptradeConnections && snaptradeConnections.length > 0);
            setHasConnectedAccounts(hasAccounts);
            setHasFunding(false); // Alpaca funding is paused
          } catch (accountError) {
            console.error('[Protected] Error checking SnapTrade in fallback:', accountError);
            setHasConnectedAccounts(false);
            setHasFunding(false);
          }
        }
      }
      
      setLoading(false);
    };

    fetchData();
  }, [router]);

  // Trigger Stripe checkout for users with connected accounts but no payment
  // CRITICAL: On failure, sets checkoutFailed to prevent infinite retry loop
  // User must manually click retry button to attempt again
  const triggerStripeCheckout = useCallback(async () => {
    if (isRedirectingToCheckout) return;
    setIsRedirectingToCheckout(true);
    setCheckoutError(null);
    
    console.log('[Protected] User has connected accounts but NO payment - triggering Stripe checkout');
    
    try {
      const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (checkoutResponse.ok) {
        const checkoutData = await checkoutResponse.json();
        if (checkoutData.url) {
          console.log('[Protected] Redirecting to Stripe checkout');
          window.location.href = checkoutData.url;
          return;
        } else {
          console.error('[Protected] No checkout URL received from Stripe');
          setCheckoutError('Unable to create checkout session. Please try again.');
        }
      } else if (checkoutResponse.status === 409) {
        // User already has active subscription (race condition protection)
        const errorData = await checkoutResponse.json();
        console.log('[Protected] User already has active subscription, redirecting to portfolio');
        router.replace(errorData.redirectTo || '/portfolio');
        return;
      } else {
        const errorData = await checkoutResponse.json().catch(() => ({}));
        console.error('[Protected] Failed to create checkout session:', checkoutResponse.status, errorData);
        setCheckoutError(errorData.error || 'Failed to create checkout session. Please try again.');
      }
    } catch (error) {
      console.error('[Protected] Error creating Stripe checkout:', error);
      setCheckoutError('Network error. Please check your connection and try again.');
    }
    
    // CRITICAL: Mark checkout as failed to prevent infinite retry loop
    // User must manually click retry to attempt again
    setCheckoutFailed(true);
    setIsRedirectingToCheckout(false);
  }, [isRedirectingToCheckout, router]);

  // Handle navigation when funding status or payment status changes
  // CRITICAL: Users need BOTH connected accounts AND active payment to access /portfolio
  // Users with accounts but no payment should be redirected to Stripe checkout
  useEffect(() => {
    const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
    
    if (!loading && hasCompletedOnboarding) {
      if (hasActivePayment) {
        // User has paid - they can access /portfolio
        console.log('[Protected] User has active payment, redirecting to /portfolio');
        router.replace('/portfolio');
      } else if (hasConnectedAccounts && !isRedirectingToCheckout && !checkoutFailed) {
        // User has accounts but NO payment - trigger Stripe checkout
        // This handles the case where user returns to /protected after connecting brokerage
        // but the callback failed to redirect to Stripe
        // CRITICAL: Only auto-trigger if checkout hasn't already failed (prevents infinite loop)
        triggerStripeCheckout();
      }
      // If hasFunding (Alpaca) but no payment, the Alpaca funding flow handles it
      // If checkoutFailed, user sees error UI with manual retry button
    }
  }, [hasConnectedAccounts, hasFunding, hasActivePayment, userStatus, loading, router, isRedirectingToCheckout, checkoutFailed, triggerStripeCheckout]);

  // Fallback redirect for unexpected states - should rarely be needed
  useEffect(() => {
    const hasCompleted = userStatus === 'submitted' || userStatus === 'approved';
    if (!loading && hasCompleted && fundingStep !== 'welcome' && fundingStep !== 'connect-bank') {
      // Only redirect if user has payment, otherwise they should stay to complete payment
      if (hasActivePayment) {
        console.log('[Protected] Unexpected state: invalid funding step with active payment, redirecting to /portfolio');
        router.replace('/portfolio');
      }
    }
  }, [loading, userStatus, fundingStep, hasActivePayment, router]);

  if (loading) {
    return (
      <div className="flex-1 w-full flex flex-col gap-4 p-2 sm:p-4">
        <div className="w-full">
          <Skeleton className="h-10 w-1/2 mb-4" />
          <Skeleton className="h-12 w-full mb-4" />
        </div>
        <div className="flex flex-col gap-2 items-start mt-4">
          <Skeleton className="h-8 w-1/4 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }
  
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';

  // pending_closure users are now redirected to /account-closure by middleware
  
  if (userStatus === 'closed') {
    return (
      <div className="flex-1 w-full flex flex-col p-2 sm:p-4 min-h-screen">
        <div className="flex-grow pb-16">
          <div className="max-w-2xl mx-auto py-8">
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <h1 className="text-2xl font-bold mb-4">Welcome Back to Clera</h1>
              <p className="text-muted-foreground mb-6">
                Your previous account has been closed. You can create a new account to start trading again.
              </p>
              <OnboardingFlow 
                userId={user.id} 
                userEmail={user.email}
                initialData={undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!hasCompletedOnboarding) {
    return (
      <div className="flex-1 w-full flex flex-col">
        <div className="flex-grow pb-16">
          <OnboardingFlow 
            userId={user.id}
            userEmail={user.email} 
            initialData={onboardingData?.onboarding_data}
          />
        </div>
      </div>
    );
  }

  // If onboarding is complete but funding/connection is not, show appropriate next step
  // If user has payment, they were already redirected to /portfolio via useEffect

  // ARCHITECTURE: Determine which flow to show based on portfolio mode
  // - Aggregation mode (no Alpaca account): Show SnapTrade connection step
  // - Brokerage mode (has Alpaca account): Show Alpaca funding flow
  const hasAlpacaAccount = !!onboardingData?.alpaca_account_id;
  const isAggregationMode = portfolioMode === 'aggregation' || !hasAlpacaAccount;

  // Manual retry handler for checkout - resets failed state and tries again
  const handleRetryCheckout = () => {
    setCheckoutFailed(false);
    setCheckoutError(null);
    // triggerStripeCheckout will be called by the useEffect when checkoutFailed becomes false
  };

  // Show payment required UI when checkout has failed
  // This prevents infinite retry loop - user must manually click to retry
  if (hasConnectedAccounts && !hasActivePayment && checkoutFailed) {
    return (
      <div className="flex-1 w-full flex flex-col">
        <div className="flex-grow pb-16">
          <div className="w-full max-w-md mx-auto pt-8 sm:pt-16 px-4">
            <div className="bg-card border border-border/40 rounded-xl shadow-lg overflow-hidden p-8 text-center">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-emerald-100 rounded-full">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-emerald-500 mb-2">
                Brokerage Connected!
              </h2>
              
              <p className="text-gray-400 mb-6">
                Your brokerage account has been connected successfully. Complete your subscription to access your portfolio.
              </p>
              
              {checkoutError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
                  <p className="text-red-400 text-sm">{checkoutError}</p>
                </div>
              )}
              
              <div className="space-y-3">
                <button
                  onClick={handleRetryCheckout}
                  disabled={isRedirectingToCheckout}
                  className="w-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium py-3 px-4 rounded-lg transition-colors"
                >
                  {isRedirectingToCheckout ? 'Redirecting...' : 'Complete Subscription'}
                </button>
                
                <p className="text-xs text-gray-500">
                  You&apos;ll be redirected to our secure payment page
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If user has completed onboarding but hasn't connected any accounts yet (aggregation mode)
  // Show them the SnapTrade connection step, NOT the Alpaca funding flow
  // Note: If user HAS connected accounts but NO payment, the useEffect above triggers Stripe checkout
  if (isAggregationMode && !hasConnectedAccounts) {
    // Callback that handles "Skip for now" or connection completion
    // CRITICAL: This triggers Stripe checkout for users who haven't paid yet
    const handleConnectionComplete = async () => {
      console.log('[Protected] handleConnectionComplete called');
      
      // Check payment status and attempt checkout if needed
      try {
        const paymentCheck = await fetch('/api/stripe/check-payment-status');
        if (paymentCheck.ok) {
          const paymentData = await paymentCheck.json();
          
          if (paymentData.hasActivePayment) {
            // User has already paid - they can go to portfolio
            console.log('[Protected] User has active payment, redirecting to portfolio');
            router.replace('/portfolio');
            return;
          }
        }
        
        // User needs to complete payment - redirect to Stripe checkout
        console.log('[Protected] User needs to complete payment, creating Stripe checkout session');
        const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (checkoutResponse.ok) {
          const checkoutData = await checkoutResponse.json();
          if (checkoutData.url) {
            console.log('[Protected] Redirecting to Stripe checkout');
            window.location.href = checkoutData.url;
            return;
          } else {
            console.error('[Protected] No checkout URL received from Stripe API');
          }
        } else if (checkoutResponse.status === 409) {
          // User already has active subscription (race condition protection)
          const errorData = await checkoutResponse.json();
          console.log('[Protected] User already has active subscription, redirecting to portfolio');
          router.replace(errorData.redirectTo || '/portfolio');
          return;
        } else {
          const errorData = await checkoutResponse.json().catch(() => ({}));
          console.error('[Protected] Failed to create checkout session:', checkoutResponse.status, errorData);
        }
      } catch (error) {
        console.error('[Protected] Error in handleConnectionComplete:', error);
      }
      
      // CRITICAL: If we reach here, Stripe checkout creation FAILED
      // Stay on /protected page so user can try again, rather than sending them
      // to /portfolio where all API calls will fail with 402
      console.log('[Protected] Stripe checkout failed - staying on page for retry');
      // Refresh the page state to allow retry
      window.location.reload();
    };
    
    return (
      <div className="flex-1 w-full flex flex-col">
        <div className="flex-grow pb-16">
          {/* Import and show SnapTradeConnectionStep directly for aggregation users */}
          <div className="w-full max-w-2xl mx-auto pt-2 sm:pt-5">
            <div className="bg-card border border-border/40 rounded-xl shadow-lg overflow-hidden">
              <SnapTradeConnectionStep 
                onComplete={handleConnectionComplete}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Welcome step - "Almost there!" page (for brokerage/hybrid mode with Alpaca account)
  if (fundingStep === 'welcome') {
    return (
      <div className="flex-1 w-full flex flex-col min-h-screen">
        <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            {/* Success Message */}
            <div className="text-center">
              <div className="relative">
                <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
                <h1 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent relative">
                  Almost there{profile?.first_name ? `, ${profile.first_name}` : ''}!
                </h1>
              </div>
              
              <div className="bg-card/50 border border-border/30 rounded-xl p-6 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg text-muted-foreground mb-2">
                  Your account has been processed.
                </p>
                <p className="text-base text-muted-foreground">
                  Funding is the last step!
                </p>
              </div>
            </div>

            {/* Bank Connection */}
            <div className="space-y-4">
              <ManualBankEntry 
                userName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
                alpacaAccountId={onboardingData?.alpaca_account_id}
                onStartConnection={() => setFundingStep('connect-bank')}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bank connection step - Full clean page for bank connection
  if (fundingStep === 'connect-bank') {
    return (
      <div className="flex-1 w-full flex flex-col min-h-screen">
        <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-lg w-full">
            <ManualBankEntry 
              userName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
              alpacaAccountId={onboardingData?.alpaca_account_id}
              onBack={() => setFundingStep('welcome')}
              onTransferComplete={() => {
                setHasFunding(true);
                router.replace('/portfolio');
              }}
              showFullForm={true}
            />
          </div>
        </div>
      </div>
    );
  }

  // This should never be reached since funded users are redirected above
  // If we reach here, something unexpected happened
  console.log('Unexpected state: reached end of protected page logic - check component logic');
  return null;
}
