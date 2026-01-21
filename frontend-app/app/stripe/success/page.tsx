'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { CheckCircle2, Loader2 } from 'lucide-react';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setError('No session ID provided');
      setStatus('error');
      return;
    }

    const verifyPayment = async (retries = 0) => {
      try {
        // Verify the payment with our backend
        const response = await fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
          throw new Error('Failed to verify payment');
        }

        const data = await response.json();

        // Check if payment is active in our database (webhook may have updated it)
        const paymentCheck = await fetch('/api/stripe/check-payment-status');
        const paymentData = paymentCheck.ok ? await paymentCheck.json() : null;

        const hasActivePayment = paymentData?.hasActivePayment || 
          data.status === 'complete' || 
          data.paymentStatus === 'active';

        if (hasActivePayment) {
          setStatus('success');
          
          // Redirect to portfolio after a short delay
          setTimeout(() => {
            router.push('/portfolio');
          }, 2000);
        } else if (retries < 5 && data.status === 'complete') {
          // Webhook might not have fired yet, wait and retry
          // Stripe session is complete, but our DB might not be updated yet
          console.log(`Payment session complete, waiting for webhook (attempt ${retries + 1}/5)...`);
          setTimeout(() => verifyPayment(retries + 1), 1000);
        } else {
          // If session is complete but we still don't have payment record after retries,
          // still allow access (webhook will catch up)
          if (data.status === 'complete') {
            console.log('Session complete, allowing access (webhook will update DB)');
            setStatus('success');
            setTimeout(() => {
              router.push('/portfolio');
            }, 2000);
          } else {
            setError('Payment verification failed');
            setStatus('error');
          }
        }
      } catch (err) {
        console.error('Error verifying payment:', err);
        if (retries < 3) {
          // Retry on network errors
          setTimeout(() => verifyPayment(retries + 1), 1000);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to verify payment');
          setStatus('error');
        }
      }
    };

    // Small delay to allow webhook to process
    setTimeout(() => verifyPayment(), 500);
  }, [searchParams, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="max-w-md w-full text-center p-8">
          <Loader2 className="h-16 w-16 mx-auto mb-6 text-emerald-500 animate-spin" />
          <h2 className="text-2xl font-bold text-white mb-2">Verifying Payment</h2>
          <p className="text-gray-400">Please wait while we confirm your subscription...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="max-w-md w-full text-center p-8">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-500/20 mb-6">
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
          <h2 className="text-2xl font-bold text-red-500 mb-2">Payment Verification Failed</h2>
          <p className="text-gray-400 mb-4">{error || 'There was an issue verifying your payment.'}</p>
          <button
            onClick={() => router.push('/protected')}
            className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="max-w-md w-full text-center p-8">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/20 mb-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-500 mb-2">Payment Successful!</h2>
        <p className="text-gray-400 mb-4">
          Your subscription to Clera has been activated. Redirecting to your portfolio...
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <Loader2 className="h-16 w-16 mx-auto mb-6 text-emerald-500 animate-spin" />
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

