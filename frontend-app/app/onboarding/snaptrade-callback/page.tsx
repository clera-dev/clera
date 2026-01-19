'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { createClient } from '@/utils/supabase/client';
import { validateAndSanitizeRedirectUrl } from '@/utils/security';
import { Button } from '@/components/ui/button';

// Disable static generation for this page (uses search params)
export const dynamic = 'force-dynamic';

type CallbackStatus = 'loading' | 'success' | 'error' | 'cancelled';

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
    const safeReturnTo = returnToParam
      ? validateAndSanitizeRedirectUrl(decodeURIComponent(returnToParam))
      : '/protected';
    setReturnToPath(safeReturnTo);
    const shouldReturnToDashboard = safeReturnTo === '/dashboard';

    console.log('SnapTrade callback - checking for errors:', { error });

    if (error) {
      setStatus('error');
      toast.error(`Connection Failed: ${decodeURIComponent(error)}`);
      
      // Redirect back after 3 seconds
      setTimeout(() => {
        router.push(safeReturnTo);
      }, 3000);
      return;
    }

    // CRITICAL: SnapTrade does NOT return authorizationId in the URL
    // We need to fetch the user's most recent connection from the backend
    // The backend will query SnapTrade API for all user connections
    setStatus('success');
    toast.success('Your brokerage account has been connected successfully!');
    
    const completeOnboarding = async () => {
      try {
        console.log('📥 SnapTrade callback - syncing connection...');
        
        // Get JWT token from Supabase session
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.error('❌ No active session found');
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
          
          // If user cancelled the SnapTrade flow, there will be no new connections
          const connectionsSynced = result.connections_synced ?? 0;
          const accountsSynced = result.accounts_synced ?? 0;
          if (connectionsSynced === 0 && accountsSynced === 0) {
            setStatus('cancelled');
            toast('Connection not completed. You can try again anytime.');
            setTimeout(() => {
              window.location.href = safeReturnTo;
            }, 1500);
            return;
          }

          if (shouldReturnToDashboard) {
            setTimeout(() => {
              window.location.href = safeReturnTo;
            }, 1000);
            return;
          }

          // Check if user has active payment/subscription
          const paymentCheck = await fetch('/api/stripe/check-payment-status', {
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          if (paymentCheck.ok) {
            const paymentData = await paymentCheck.json();
            
            if (paymentData.hasActivePayment) {
              // User has active payment, redirect to portfolio
              console.log('✅ User has active payment, redirecting to portfolio');
              setTimeout(() => {
                window.location.href = '/portfolio';
              }, 1000);
            } else {
              // User needs to complete payment, redirect to Stripe checkout
              console.log('📝 User needs to complete payment, redirecting to Stripe checkout');
              const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
                }
              });

              if (checkoutResponse.ok) {
                const checkoutData = await checkoutResponse.json();
                if (checkoutData.url) {
                  window.location.href = checkoutData.url;
                } else {
                  console.error('❌ No checkout URL received');
                  setTimeout(() => {
                    window.location.href = safeReturnTo;
                  }, 2000);
                }
              } else if (checkoutResponse.status === 409) {
                // User already has active subscription (race condition protection)
                const errorData = await checkoutResponse.json();
                console.log('✅ User already has active subscription, redirecting to portfolio');
                window.location.href = errorData.redirectTo || '/portfolio';
              } else {
                console.error('❌ Failed to create checkout session');
                setTimeout(() => {
                  window.location.href = safeReturnTo;
                }, 2000);
              }
            }
          } else {
            // If payment check fails, redirect to checkout to be safe
            console.log('⚠️ Payment check failed, redirecting to checkout');
            const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              }
            });

            if (checkoutResponse.ok) {
              const checkoutData = await checkoutResponse.json();
              if (checkoutData.url) {
                window.location.href = checkoutData.url;
              } else {
                  setTimeout(() => {
                    window.location.href = safeReturnTo;
                  }, 2000);
              }
            } else if (checkoutResponse.status === 409) {
              // User already has active subscription
              const errorData = await checkoutResponse.json();
              console.log('✅ User already has active subscription, redirecting to portfolio');
              window.location.href = errorData.redirectTo || '/portfolio';
            } else {
              setTimeout(() => {
                window.location.href = safeReturnTo;
              }, 2000);
            }
          }
        } else {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ Failed to sync connections:', error);
          // Redirect back to protected page
          setTimeout(() => {
            router.push(safeReturnTo);
          }, 2000);
        }
      } catch (error) {
        console.error('❌ Error completing onboarding:', error);
        // Redirect back to protected page
        setTimeout(() => {
          router.push(safeReturnTo);
        }, 2000);
      }
    };
    
    completeOnboarding();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center p-8">
        {status === 'loading' && (
          <>
            <div className="mb-6">
              <svg 
                className="animate-spin h-16 w-16 mx-auto text-blue-600" 
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Processing Connection</h2>
            <p className="text-gray-600">Please wait while we connect your brokerage account...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
                <svg 
                  className="h-10 w-10 text-green-600" 
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
            <h2 className="text-2xl font-bold text-green-600 mb-2">Connection Successful!</h2>
            <p className="text-gray-600">
              Your brokerage account has been connected. Setting up your subscription...
            </p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
                <svg 
                  className="h-10 w-10 text-red-600" 
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
            <h2 className="text-2xl font-bold text-red-600 mb-2">Connection Failed</h2>
            <p className="text-gray-600 mb-4">
              We couldn't connect your brokerage account. You'll be redirected back to try again.
            </p>
            <p className="text-sm text-gray-500">
              If the problem persists, please contact support.
            </p>
            <div className="mt-4">
              <Button onClick={() => router.push(returnToPath)}>
                Return to app
              </Button>
            </div>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100">
                <svg 
                  className="h-10 w-10 text-gray-600" 
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Cancelled</h2>
            <p className="text-gray-600">
              No brokerage was connected. You can return and try again anytime.
            </p>
            <div className="mt-4">
              <Button onClick={() => router.push(returnToPath)}>
                Return to app
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

