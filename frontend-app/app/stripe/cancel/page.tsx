'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, ArrowLeft, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CancelPage() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const handleRetryPayment = async () => {
    setRetrying(true);
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
        // Already has subscription
        const data = await response.json();
        router.push(data.redirectTo || '/portfolio');
        return;
      }
      // Fallback to protected page
      router.push('/protected');
    } catch (error) {
      console.error('Error retrying payment:', error);
      router.push('/protected');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="max-w-md w-full text-center p-8">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-500/20 mb-6">
          <XCircle className="h-10 w-10 text-yellow-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Payment Canceled</h2>
        <p className="text-gray-400 mb-6">
          Your payment was canceled. You can complete your subscription at any time to access Clera.
        </p>
        <div className="space-y-3">
          <Button
            onClick={handleRetryPayment}
            disabled={retrying}
            className="w-full bg-white text-black hover:bg-gray-200"
          >
            {retrying ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Try Payment Again
              </span>
            )}
          </Button>
          <Button
            onClick={() => router.push('/protected')}
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Return to Setup
          </Button>
        </div>
      </div>
    </div>
  );
}

