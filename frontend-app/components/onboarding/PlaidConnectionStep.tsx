"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Building2, AlertCircle, ExternalLink, ArrowRight } from "lucide-react";

interface PlaidConnectionStepProps {
  onComplete: () => void;
  onBack?: () => void;
}

export default function PlaidConnectionStep({ onComplete, onBack }: PlaidConnectionStepProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);

  // Create link token for Plaid Link
  const createLinkToken = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/test/plaid/create-link-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}) // Add proper request body
      });

      if (!response.ok) {
        throw new Error('Failed to initialize account connection');
      }

      const data = await response.json();
      if (data.success && data.link_token) {
        setLinkToken(data.link_token);
      } else {
        throw new Error(data.error || 'Failed to initialize account connection');
      }
    } catch (err) {
      console.error('Error creating link token:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize account connection');
    }
  }, []);

  // Handle successful account connection
  const onSuccessCallback = async (publicToken: string, metadata: any) => {
    try {
      setConnecting(true);
      setError(null);

      console.log('🔗 Plaid Link success in onboarding:', { publicToken, metadata });

      // DUPLICATE PREVENTION (Plaid Best Practice)
      // Check for duplicate items BEFORE exchanging token
      // Prevents: double billing, confusing UX, fraud attempts
      const duplicateCheck = await fetch('/api/test/plaid/check-duplicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          institution_id: metadata.institution?.institution_id,
          accounts: metadata.accounts || [],
        }),
      });

      if (duplicateCheck.ok) {
        const duplicateResult = await duplicateCheck.json();
        
        if (duplicateResult.isDuplicate) {
          console.log('⚠️ Duplicate detected - accounts already connected');
          setConnected(true);
          setConnectionCount(prev => prev + duplicateResult.matchedAccounts.length);
          
          // Show success message and proceed
          setTimeout(() => {
            onComplete();
          }, 2000);
          return; // DON'T exchange token - already have it!
        }
      }

      // No duplicate - proceed with token exchange
      const response = await fetch('/api/test/plaid/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect account');
      }

      const result = await response.json();
      console.log('✅ Account connected in onboarding:', result);

      setConnected(true);
      setConnectionCount(prev => prev + (metadata.accounts?.length || 1));
      
      // Brief success state before proceeding
      setTimeout(() => {
        onComplete();
      }, 2000);

    } catch (err) {
      console.error('Error connecting account:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect account');
      setConnecting(false);
    }
  };

  // Handle Plaid Link exit
  const onExitCallback = (err: any, metadata: any) => {
    console.log('Plaid Link exit in onboarding:', { err, metadata });
    setConnecting(false);
    
    if (err) {
      console.error('Plaid Link error:', err);
      setError(err.error_message || err.message || 'Connection cancelled');
    }
  };

  // Configure Plaid Link
  const config = {
    token: linkToken,
    onSuccess: onSuccessCallback,
    onExit: onExitCallback,
  };

  const { open, ready } = usePlaidLink(config);

  // Initialize on component mount
  useEffect(() => {
    createLinkToken();
  }, [createLinkToken]);

  // Success state
  if (connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="relative">
            <div className="absolute -top-16 -left-16 w-32 h-32 bg-green-500/5 rounded-full blur-xl" />
            <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
            <div className="bg-card border border-border/30 rounded-xl p-8 shadow-lg relative">
              <div className="flex justify-center mb-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-green-500 to-blue-600 bg-clip-text text-transparent">
                Accounts Connected!
              </h2>
              <p className="text-muted-foreground text-lg">
                Your investment accounts are now connected to Clera
              </p>
              <div className="mt-6 pt-6 border-t border-border/30">
                <p className="text-sm text-muted-foreground">
                  {connectionCount} account{connectionCount !== 1 ? 's' : ''} connected
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[60vh] px-3 sm:px-4 py-4 sm:py-6">
      <div className="max-w-lg mx-auto text-center space-y-4 sm:space-y-6 w-full">
        <div className="relative">
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl hidden sm:block" />
          <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg hidden sm:block" />
          <div className="bg-card border border-border/30 rounded-xl p-5 sm:p-8 shadow-lg relative">
            
            {/* Icon */}
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="relative">
                <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-2 border-background" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Connect Your Investment Accounts
            </h2>

            {/* Description */}
            <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-6">
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                Securely connect your investment accounts to see your complete portfolio in one place
              </p>
              
              <div className="grid grid-cols-1 gap-1 sm:gap-1.5 text-[11px] sm:text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                  <span className="truncate">Bank accounts (401k, IRA, Roth IRA)</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                  <span className="truncate">Brokerage (Schwab, Fidelity, E*TRADE)</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                  <span className="truncate">Retirement (403b, TSP, SEP-IRA)</span>
                </div>
              </div>

              {/* Trust Indicators - Modern & Minimal */}
              <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-lg p-2.5 sm:p-4 mt-3 sm:mt-4 border border-border/20">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-medium text-[11px] sm:text-sm">Powered by Plaid</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-0.5 sm:gap-y-1 text-[9px] sm:text-xs text-muted-foreground">
                  <span>✓ SOC 2 Certified</span>
                  <span>✓ 12,000+ banks</span>
                  <span>✓ Used by Venmo, Robinhood, and 8k+ others</span>
                </div>
              </div>
            </div>

            {/* Connect Button */}
            <div className="space-y-3">
              <Button
                onClick={() => ready ? open() : createLinkToken()}
                disabled={connecting || (!ready && !linkToken)}
                size="lg"
                className="w-full font-semibold text-sm sm:text-base px-5 py-4 sm:py-5 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90"
              >
                {connecting ? (
                  <>
                    <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 mr-2 animate-pulse" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect with
                    <img src="/plaid-glyph.png" alt="Plaid" className="h-12 w-auto sm:h-14 ml-1 opacity-95" />
                  </>
                )}
              </Button>

              {/* Skip Option */}
              <div className="text-center space-y-1">
                <Button 
                  variant="ghost" 
                  onClick={onComplete}
                  className="text-muted-foreground hover:text-foreground text-xs sm:text-sm h-auto py-2"
                >
                  Skip for now →
                </Button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-6 max-w-md mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
