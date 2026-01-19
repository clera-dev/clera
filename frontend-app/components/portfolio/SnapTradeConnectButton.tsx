'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { validateAndSanitizeRedirectUrl } from '@/utils/security';

interface SnapTradeConnectButtonProps {
  /**
   * Filter for brokerage capabilities:
   * - undefined: Shows ALL brokerages (recommended for onboarding)
   * - 'read': Shows only read-capable brokerages
   * - 'trade': Shows only trading-capable brokerages
   */
  connectionType?: 'read' | 'trade';
  broker?: string;
  onSuccess?: () => void;
  className?: string;
  children?: React.ReactNode;
  returnTo?: string;
}

export function SnapTradeConnectButton({
  // Use undefined/omit to show ALL brokerages (recommended)
  connectionType,
  broker,
  onSuccess,
  className,
  children,
  returnTo,
}: SnapTradeConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setIsLoading(true);

      const safeReturnTo = returnTo ? validateAndSanitizeRedirectUrl(returnTo) : null;
      const redirectUrl = safeReturnTo
        ? `${window.location.origin}/onboarding/snaptrade-callback?return_to=${encodeURIComponent(safeReturnTo)}`
        : `${window.location.origin}/onboarding/snaptrade-callback`;

      const effectiveConnectionType = connectionType || 'trade';
      const requestBody: {
        connectionType?: 'read' | 'trade';
        broker?: string;
        redirectUrl: string;
      } = {
        redirectUrl,
      };
      requestBody.connectionType = effectiveConnectionType;
      if (broker) {
        requestBody.broker = broker;
      }

      // Get connection URL from backend
      const response = await fetch('/api/snaptrade/create-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create connection URL');
      }

      const data = await response.json();

      if (!data.connectionUrl) {
        throw new Error('No connection URL received');
      }

      // Redirect to SnapTrade connection portal
      window.location.href = data.connectionUrl;

    } catch (error) {
      console.error('Error connecting brokerage:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to connect brokerage. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? (
        <>
          <svg 
            className="animate-spin -ml-1 mr-3 h-5 w-5" 
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
          Connecting...
        </>
      ) : (
        children || 'Connect Brokerage Account'
      )}
    </Button>
  );
}

