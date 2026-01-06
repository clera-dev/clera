'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { createClient } from '@/utils/supabase/client';

// Disable static generation for this page (uses search params)
export const dynamic = 'force-dynamic';

function SnapTradeReconnectCallbackContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [canClose, setCanClose] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // SnapTrade redirects back after reconnection attempt
    // URL parameters may include: error (if connection failed)
    const error = searchParams.get('error');

    console.log('SnapTrade reconnect callback - checking for errors:', { error });

    if (error) {
      setStatus('error');
      toast.error(`Reconnection Failed: ${decodeURIComponent(error)}`);
      setCanClose(true);
      return;
    }

    // Reconnection successful - sync the connection
    const syncConnection = async () => {
      try {
        console.log('📥 SnapTrade reconnect callback - syncing connection...');
        
        // Get JWT token from Supabase session
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.error('❌ No active session found');
          setStatus('error');
          toast.error('Session expired. Please log in again.');
          setCanClose(true);
          return;
        }
        
        console.log('✅ Session found, syncing connections...');
        
        // Sync all connections to update the database with the refreshed authorization
        const response = await fetch('/api/snaptrade/sync-all-connections', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('✅ Connection synced successfully:', result);
          
          setStatus('success');
          toast.success('Your brokerage account has been reconnected!');
          setCanClose(true);
          
          // Try to auto-close the tab after a short delay
          // Note: window.close() only works for tabs opened via window.open()
          // It silently fails otherwise (doesn't throw), so we use a timeout check
          setTimeout(() => {
            window.close();
            // If we're still here after 100ms, the close didn't work
            setTimeout(() => {
              console.log('Auto-close failed, user will close manually or use dashboard button');
            }, 100);
          }, 2000);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('❌ Failed to sync connection:', errorData);
          setStatus('error');
          toast.error('Failed to sync connection. Please try again.');
          setCanClose(true);
        }
      } catch (error) {
        console.error('❌ Error syncing reconnection:', error);
        setStatus('error');
        toast.error('An error occurred. Please try again.');
        setCanClose(true);
      }
    };
    
    syncConnection();
  }, [searchParams]);

  const handleClose = () => {
    // Try to close the tab
    // Note: window.close() silently fails if not opened via window.open()
    // It doesn't throw, so we use a timeout to detect failure
    window.close();
    
    // If still here after 200ms, the close didn't work - redirect to dashboard
    setTimeout(() => {
      // If we reach this code, window.close() failed
      window.location.href = '/dashboard';
    }, 200);
  };

  const handleReturnToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <Toaster position="top-center" />
      <div className="max-w-md w-full text-center p-8 bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl">
        {status === 'loading' && (
          <>
            <div className="mb-6">
              <svg 
                className="animate-spin h-16 w-16 mx-auto text-blue-500" 
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
            <h2 className="text-2xl font-bold text-white mb-2">Reconnecting...</h2>
            <p className="text-gray-400">Please wait while we refresh your brokerage connection.</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-500/20">
                <svg 
                  className="h-10 w-10 text-green-500" 
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
            <h2 className="text-2xl font-bold text-green-500 mb-2">Reconnected!</h2>
            <p className="text-gray-400 mb-6">
              Your brokerage account has been successfully reconnected. You can now close this tab and continue trading.
            </p>
            {canClose && (
              <div className="space-y-3">
                <button
                  onClick={handleClose}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors"
                >
                  Close This Tab
                </button>
                <button
                  onClick={handleReturnToDashboard}
                  className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-xl transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
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
            <h2 className="text-2xl font-bold text-red-500 mb-2">Reconnection Failed</h2>
            <p className="text-gray-400 mb-6">
              We couldn't reconnect your brokerage account. Please try again from the dashboard.
            </p>
            {canClose && (
              <div className="space-y-3">
                <button
                  onClick={handleReturnToDashboard}
                  className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors"
                >
                  Return to Dashboard
                </button>
                <p className="text-sm text-gray-500">
                  If the problem persists, please contact support.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SnapTradeReconnectCallback() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-center text-white">Loading...</div>
      </div>
    }>
      <SnapTradeReconnectCallbackContent />
    </Suspense>
  );
}

