'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { createClient } from '@/utils/supabase/client';
import { validateAndSanitizeRedirectUrl } from '@/utils/security';
import { Button } from '@/components/ui/button';

// Disable static generation for this page (uses search params)
export const dynamic = 'force-dynamic';

type CallbackStatus = 'loading' | 'success' | 'error' | 'cancelled' | 'payment_required';

function SnapTradeCallbackContent() {
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [returnToPath, setReturnToPath] = useState('/protected');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // SnapTrade redirects back after connection attempt
    // URL parameters may include: error (if connection failed)
    const error = searchParams.get('error');
    const returnToParam = searchParams.get('return_to');
    const safeDecode = (value: string | null) => {
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch (decodeError) {
        console.warn('SnapTrade callback - invalid URL encoding for return_to', decodeError);
        return null;
      }
    };
    const decodedReturnTo = safeDecode(returnToParam);
    const safeReturnTo = decodedReturnTo
      ? validateAndSanitizeRedirectUrl(decodedReturnTo)
      : '/protected';
    setReturnToPath(safeReturnTo);
    const shouldReturnToDashboard = safeReturnTo === '/dashboard';

    console.log('SnapTrade callback - checking for errors:', { error });

    // Check for explicit error or cancellation from SnapTrade
    // SnapTrade may pass status=CANCELLED, status=CLOSED, or error param
    const statusParam = searchParams.get('status');
    const isCancelled = statusParam?.toUpperCase() === 'CANCELLED' || 
                        statusParam?.toUpperCase() === 'CLOSED' ||
                        statusParam?.toUpperCase() === 'EXIT';
    
    if (error) {
      setStatus('error');
      const decodedError = safeDecode(error);
      toast.error(`Connection Failed: ${decodedError || error}`);
      
      // Redirect back after 3 seconds
      setTimeout(() => {
        router.push(safeReturnTo);
      }, 3000);
      return;
    }
    
    // If user explicitly cancelled, redirect back immediately
    if (isCancelled) {
      setStatus('cancelled');
      toast('Connection cancelled. You can try again anytime.');
      setTimeout(() => {
        router.push(safeReturnTo);
      }, 1500);
      return;
    }

    // CRITICAL: SnapTrade does NOT return authorizationId in the URL
    // We need to fetch the user's most recent connection from the backend
    // The backend will query SnapTrade API for all user connections
    // Keep status as 'loading' until we verify the connection was actually made
    
    const completeOnboarding = async () => {
      try {
        console.log('📥 SnapTrade callback - syncing connection...');
        
        // Get JWT token from Supabase session
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.error('❌ No active session found');
          setStatus('error');
          toast.error('Session expired. Please log in again.');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
          return;
        }
        
        console.log('✅ Session found, JWT token length:', session.access_token.length);
        console.log('📤 Calling /api/snaptrade/sync-all-connections');
        
        // Call a NEW endpoint that fetches ALL user connections and syncs them
        const response = await fetch('/api/snaptrade/sync-all-connections', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('✅ All connections synced successfully:', result);
          
          // Treat as cancelled only when the API explicitly reports no connections
          const hasSyncCounts = typeof result.connections_synced === 'number' && typeof result.accounts_synced === 'number';
          const connectionsSynced = hasSyncCounts ? result.connections_synced : null;
          const accountsSynced = hasSyncCounts ? result.accounts_synced : null;
          if (result.no_connections === true || (hasSyncCounts && connectionsSynced === 0 && accountsSynced === 0)) {
            setStatus('cancelled');
            toast('Connection not completed. You can try again anytime.');
            setTimeout(() => {
              window.location.href = safeReturnTo;
            }, 1500);
            return;
          }
          
          // NOW we know connections were actually synced - show success
          setStatus('success');
          toast.success('Your brokerage account has been connected successfully!');

          if (shouldReturnToDashboard) {
            setTimeout(() => {
              window.location.href = safeReturnTo;
            }, 1000);
            return;
          }

          // Check if user has active payment/subscription
          console.log('📋 Checking payment status...');
          const paymentCheck = await fetch('/api/stripe/check-payment-status', {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          if (paymentCheck.ok) {
            const paymentData = await paymentCheck.json();
            console.log('📋 Payment status:', paymentData);
            
            if (paymentData.hasActivePayment) {
              // User has active payment, redirect to portfolio
              console.log('✅ User has active payment, redirecting to portfolio');
              setTimeout(() => {
                window.location.href = '/portfolio';
              }, 1000);
              return;
            }
          }
          
          // User needs to complete payment - redirect to Stripe checkout
          console.log('📝 User needs to complete payment, creating Stripe checkout session...');
          const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          console.log('📝 Checkout response status:', checkoutResponse.status);

          if (checkoutResponse.ok) {
            const checkoutData = await checkoutResponse.json();
            console.log('📝 Checkout data:', { hasUrl: !!checkoutData.url, sessionId: checkoutData.sessionId });
            
            if (checkoutData.url) {
              console.log('✅ Redirecting to Stripe checkout');
              window.location.href = checkoutData.url;
              return;
            } else {
              console.error('❌ No checkout URL in response');
              setStatus('payment_required');
              toast.error('Unable to start checkout. Please try again.');
            }
          } else if (checkoutResponse.status === 409) {
            // User already has active subscription (race condition protection)
            const errorData = await checkoutResponse.json();
            console.log('✅ User already has active subscription, redirecting to portfolio');
            window.location.href = errorData.redirectTo || '/portfolio';
            return;
          } else {
            // Checkout creation failed - show error and allow retry
            const errorData = await checkoutResponse.json().catch(() => ({}));
            console.error('❌ Failed to create checkout session:', checkoutResponse.status, errorData);
            setStatus('payment_required');
            toast.error(errorData.error || 'Unable to start checkout. Please try again.');
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ Failed to sync connections:', errorData);
          
          // If the sync failed because there were no connections to sync, treat as cancelled
          if (response.status === 404 || errorData.no_connections) {
            setStatus('cancelled');
            toast('Connection not completed. You can try again anytime.');
          } else {
            setStatus('error');
            toast.error('Failed to sync your brokerage connection. Please try again.');
          }
          setTimeout(() => {
            router.push(safeReturnTo);
          }, 2000);
        }
      } catch (error) {
        console.error('❌ Error completing onboarding:', error);
        setStatus('error');
        toast.error('Something went wrong. Please try again.');
        setTimeout(() => {
          router.push(safeReturnTo);
        }, 2000);
      }
    };
    
    completeOnboarding();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="max-w-md w-full text-center p-8">
        {status === 'loading' && (
          <>
            <div className="mb-6">
              <svg 
                className="animate-spin h-16 w-16 mx-auto text-emerald-500" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Verifying Connection</h2>
            <p className="text-gray-400">Please wait while we verify your brokerage connection...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/20">
                <svg 
                  className="h-10 w-10 text-emerald-500" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={3} 
                    d="M5 13l4 4L19 7" 
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-emerald-500 mb-2">Connection Successful!</h2>
            <p className="text-gray-400">
              Your brokerage account has been connected. Setting up your subscription...
            </p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20">
                <svg 
                  className="h-10 w-10 text-red-500" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={3} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-red-500 mb-2">Connection Failed</h2>
            <p className="text-gray-400 mb-4">
              We couldn&apos;t connect your brokerage account. You&apos;ll be redirected back to try again.
            </p>
            <p className="text-sm text-gray-500">
              If the problem persists, please contact support.
            </p>
            <div className="mt-4">
              <Button 
                onClick={() => router.push(returnToPath)}
                className="bg-white text-black hover:bg-gray-200"
              >
                Return to app
              </Button>
            </div>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-700/50">
                <svg 
                  className="h-10 w-10 text-gray-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Connection Cancelled</h2>
            <p className="text-gray-400">
              No brokerage was connected. You can return and try again anytime.
            </p>
            <div className="mt-4">
              <Button 
                onClick={() => router.push(returnToPath)}
                className="bg-white text-black hover:bg-gray-200"
              >
                Return to app
              </Button>
            </div>
          </>
        )}

        {status === 'payment_required' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/20">
                <svg 
                  className="h-10 w-10 text-emerald-500" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={3} 
                    d="M5 13l4 4L19 7" 
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-emerald-500 mb-2">Brokerage Connected!</h2>
            <p className="text-gray-400 mb-4">
              Your brokerage account has been connected. Complete your subscription to access your portfolio.
            </p>
            <div className="space-y-3">
              <Button 
                onClick={async () => {
                  setStatus('loading');
                  try {
                    const response = await fetch('/api/stripe/create-checkout-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' }
                    });
                    if (response.ok) {
                      const data = await response.json();
                      if (data.url) {
                        window.location.href = data.url;
                        return;
                      }
                    } else if (response.status === 409) {
                      window.location.href = '/portfolio';
                      return;
                    }
                    setStatus('payment_required');
                    toast.error('Unable to start checkout. Please try again.');
                  } catch (err) {
                    setStatus('payment_required');
                    toast.error('Something went wrong. Please try again.');
                  }
                }}
                className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
              >
                Complete Subscription
              </Button>
              <Button 
                onClick={() => router.push(returnToPath)}
                variant="ghost"
                className="w-full text-gray-400 hover:text-white"
              >
                Go back
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SnapTradeCallback() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    }>
      <SnapTradeCallbackContent />
    </Suspense>
  );
}

