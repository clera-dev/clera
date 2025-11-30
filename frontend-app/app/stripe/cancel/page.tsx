'use client';

import { useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CancelPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center p-8">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-6">
          <XCircle className="h-10 w-10 text-yellow-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Canceled</h2>
        <p className="text-gray-600 mb-6">
          Your payment was canceled. You can complete your subscription at any time to access the full platform.
        </p>
        <div className="space-y-3">
          <Button
            onClick={() => router.push('/protected')}
            className="w-full"
          >
            Return to Setup
          </Button>
          <Button
            onClick={() => router.push('/')}
            variant="outline"
            className="w-full"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}

