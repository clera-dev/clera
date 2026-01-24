"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Building2, AlertCircle, Shield, Lock, Zap } from "lucide-react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

interface SnapTradeConnectionStepProps {
  onComplete: () => void;
  onBack?: () => void;
}

export default function SnapTradeConnectionStep({ onComplete, onBack }: SnapTradeConnectionStepProps) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);

  const handleConnectionStart = async () => {
    try {
      setConnecting(true);
      setError(null);

      // Get connection URL from backend
      // ARCHITECTURE: Don't filter by connection type during onboarding to show ALL brokerages
      // This gives users a holistic view of their investments by including both read-only 
      // and trading-enabled brokerages. Trading capability is handled at the platform level
      // based on each brokerage's actual capabilities.
      // Include return_to in the redirect URL so callback knows where to send cancelled users
      const callbackUrl = new URL('/onboarding/snaptrade-callback', window.location.origin);
      callbackUrl.searchParams.set('return_to', '/protected');
      
      const response = await fetch('/api/snaptrade/create-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // No connectionType filter = show all available brokerages
          redirectUrl: callbackUrl.toString(),
        }),
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

    } catch (err) {
      console.error('Error connecting brokerage:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect brokerage. Please try again.');
      setConnecting(false);
    }
  };

  const handleConnectionSuccess = () => {
    setConnected(true);
    setConnectionCount(prev => prev + 1);
    setConnecting(false);
    
    // Auto-proceed after 1.5 seconds
    setTimeout(() => {
      onComplete();
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center py-6 sm:py-8">
      <div className="w-full max-w-2xl mx-auto space-y-5">
        
        {/* Header - more compact */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center backdrop-blur-sm border border-white/10">
            <Building2 className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
          </div>
          
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
              Connect Your Brokerage
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
              Link your accounts to view your portfolio and trade — all in one place.
            </p>
          </div>
        </div>

        {/* Main Connection Area - more compact */}
        <div className="relative">
          {/* Gradient Background Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl blur-3xl" />
          
          <div className="relative bg-card/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
            
            {/* Connection Button */}
            <div className="flex flex-col items-center space-y-3">
              <HoverBorderGradient
                as="button"
                containerClassName="rounded-full"
                className="bg-black text-white px-6 sm:px-8 py-2.5 text-sm sm:text-base font-semibold"
                onClick={handleConnectionStart}
                disabled={connecting || connected}
              >
                {connecting ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting...
                  </span>
                ) : connected ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Connected
                  </span>
                ) : (
                  <span>Connect Brokerage Account</span>
                )}
              </HoverBorderGradient>

              {connectionCount > 0 && !connected && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">
                    {connectionCount} account{connectionCount > 1 ? 's' : ''} connected
                  </span>
                </div>
              )}
            </div>

            {/* Supported Brokerages - single row on desktop */}
            <div className="pt-3 border-t border-white/5">
              <p className="text-center text-xs text-muted-foreground mb-2">
                Works with Robinhood, Fidelity, Schwab, TD Ameritrade, E*TRADE, Vanguard & 20+ more
              </p>
            </div>

            {/* Security Features - compact inline version */}
            <div className="flex flex-wrap justify-center gap-3 sm:gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Bank-level security</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">View & trade*</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-muted-foreground">Real-time sync</span>
              </div>
            </div>
            
            {/* Footnote about trading */}
            <p className="text-[10px] sm:text-xs text-muted-foreground/70 text-center">
              *Trading on supported brokerages. We never store your credentials.
            </p>
          </div>
        </div>

        {/* Success State */}
        {connected && (
          <Alert className="border-green-500/20 bg-green-500/10 backdrop-blur-xl">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300 text-sm">
              Connected! Your holdings are synced.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="backdrop-blur-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Skip Option - always visible */}
        <div className="text-center pt-1">
          <Button 
            variant="ghost" 
            onClick={() => {
              setSkipping(true);
              onComplete();
            }}
            disabled={connecting || connected || skipping}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            {skipping ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              'Skip for now →'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
