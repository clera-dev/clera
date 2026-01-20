"use client";

import { useState, useEffect } from 'react';
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
  const [hasFunding, setHasFunding] = useState<boolean>(false);
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

        // Check if user has ANY connected accounts (SnapTrade, Plaid, or funded Alpaca)
        // This determines if they should be redirected to /portfolio or stay on /protected
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
              // SnapTrade or Plaid users have external accounts - they're "ready"
              console.log('User has connected accounts (SnapTrade or Plaid) - redirecting to portfolio');
              setHasFunding(true);
            } else if (hasAlpaca) {
              // Alpaca users need to check actual funding status
              console.log('User has Alpaca account - checking funding status');
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
            } else {
              // No connected accounts - user needs to connect something
              console.log('User has no connected accounts - staying on /protected');
              setHasFunding(false);
            }
          }
        } catch (error) {
          console.error('Error fetching connection status:', error);
          // Fallback: Check for Alpaca funding only
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
        }
      }
      
      setLoading(false);
    };

    fetchData();
  }, [router]);

  // Handle navigation when funding status changes
  useEffect(() => {
    if (!loading && hasFunding && (userStatus === 'submitted' || userStatus === 'approved')) {
      console.log('User has completed onboarding and funding, redirecting to /portfolio');
      router.replace('/portfolio');
    }
  }, [hasFunding, userStatus, loading, router]);

  // Fallback redirect for unexpected states - should rarely be needed
  useEffect(() => {
    const hasCompleted = userStatus === 'submitted' || userStatus === 'approved';
    if (!loading && hasCompleted && fundingStep !== 'welcome' && fundingStep !== 'connect-bank') {
      console.log('Unexpected state: invalid funding step, redirecting to /portfolio');
      router.replace('/portfolio');
    }
  }, [loading, userStatus, fundingStep, router]);

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

  // If onboarding is complete but funding is not, show appropriate next step
  // If both are complete, user was already redirected to /invest above via useEffect

  // ARCHITECTURE: Determine which flow to show based on portfolio mode
  // - Aggregation mode (no Alpaca account): Show SnapTrade connection step
  // - Brokerage mode (has Alpaca account): Show Alpaca funding flow
  const hasAlpacaAccount = !!onboardingData?.alpaca_account_id;
  const isAggregationMode = portfolioMode === 'aggregation' || !hasAlpacaAccount;

  // If user has completed onboarding but hasn't connected any accounts yet (aggregation mode)
  // Show them the SnapTrade connection step, NOT the Alpaca funding flow
  if (isAggregationMode && !hasFunding) {
    // Callback that handles "Skip for now" - must go through payment flow
    // CRITICAL: Do NOT redirect to /portfolio directly - user needs to pay first!
    // This mirrors the logic in snaptrade-callback/page.tsx for consistency
    const handleConnectionComplete = async () => {
      // Fire-and-forget: Check connection status in background for analytics
      fetch('/api/portfolio/connection-status')
        .then(response => response.ok ? response.json() : null)
        .then(modeData => {
          if (modeData) {
            const snaptradeAccounts = modeData.snaptrade_accounts || [];
            const plaidAccounts = modeData.plaid_accounts || [];
            if (snaptradeAccounts.length > 0 || plaidAccounts.length > 0) {
              setHasFunding(true);
            }
          }
        })
        .catch(error => console.error('Error checking connection status:', error));
      
      // CRITICAL: Check payment status before redirecting
      // If user hasn't paid, send them to Stripe checkout
      try {
        const paymentCheck = await fetch('/api/stripe/check-payment-status');
        if (paymentCheck.ok) {
          const paymentData = await paymentCheck.json();
          
          if (paymentData.hasActivePayment) {
            // User has already paid - they can skip connecting and go to portfolio
            console.log('✅ User has active payment, redirecting to portfolio');
            router.replace('/portfolio');
          } else {
            // User needs to complete payment - redirect to Stripe checkout
            console.log('📝 User needs to complete payment, redirecting to Stripe checkout');
            const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            if (checkoutResponse.ok) {
              const checkoutData = await checkoutResponse.json();
              if (checkoutData.url) {
                window.location.href = checkoutData.url;
              } else {
                console.error('❌ No checkout URL received');
                // Fallback: stay on protected page
              }
            } else if (checkoutResponse.status === 409) {
              // User already has active subscription (race condition protection)
              const errorData = await checkoutResponse.json();
              console.log('✅ User already has active subscription, redirecting to portfolio');
              router.replace(errorData.redirectTo || '/portfolio');
            } else {
              console.error('❌ Failed to create checkout session');
              // Fallback: stay on protected page
            }
          }
        } else {
          // Payment check failed - redirect to checkout to be safe
          console.log('⚠️ Payment check failed, redirecting to checkout');
          const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          if (checkoutResponse.ok) {
            const checkoutData = await checkoutResponse.json();
            if (checkoutData.url) {
              window.location.href = checkoutData.url;
            }
          } else if (checkoutResponse.status === 409) {
            const errorData = await checkoutResponse.json();
            router.replace(errorData.redirectTo || '/portfolio');
          }
        }
      } catch (error) {
        console.error('❌ Error in skip flow:', error);
        // On error, stay on protected page rather than getting stuck in a loop
      }
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
