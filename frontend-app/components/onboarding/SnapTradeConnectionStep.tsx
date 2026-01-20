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
      callbackUrl.searchParams.set('return_to', encodeURIComponent('/protected'));
      
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
    <div className="min-h-[60vh] flex items-center justify-center py-12">
      <div className="w-full max-w-2xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center backdrop-blur-sm border border-white/10">
            <Building2 className="h-10 w-10 text-white" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
              Connect Your Investment Accounts
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Link your brokerage accounts to view your entire portfolio in one place.
              Trading is available on supported brokerages.
            </p>
          </div>
        </div>

        {/* Main Connection Area */}
        <div className="relative">
          {/* Gradient Background Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl" />
          
          <div className="relative bg-card/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 space-y-6">
            
            {/* Connection Button */}
            <div className="flex flex-col items-center space-y-4">
              <HoverBorderGradient
                as="button"
                containerClassName="rounded-full"
                className="bg-black text-white px-8 py-3 text-base font-semibold"
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

            {/* Supported Brokerages */}
            <div className="pt-4 border-t border-white/5">
              <p className="text-center text-sm text-muted-foreground mb-3">
                Supported brokerages include:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Robinhood', 'Fidelity', 'Charles Schwab', 'TD Ameritrade', 'E*TRADE', 'Vanguard'].map((broker) => (
                  <div 
                    key={broker}
                    className="px-3 py-1.5 text-xs font-medium bg-white/5 rounded-full border border-white/10 text-muted-foreground"
                  >
                    {broker}
                  </div>
                ))}
                <div className="px-3 py-1.5 text-xs font-medium bg-white/5 rounded-full border border-white/10 text-muted-foreground">
                  +20 more
                </div>
              </div>
            </div>

            {/* Security Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Bank-Level Security</p>
                  <p className="text-xs text-muted-foreground mt-1">256-bit encryption</p>
                </div>
              </div>

              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Read-Only Access</p>
                  <p className="text-xs text-muted-foreground mt-1">We never store credentials</p>
                </div>
              </div>

              <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Instant Sync</p>
                  <p className="text-xs text-muted-foreground mt-1">Real-time updates</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Success State */}
        {connected && (
          <Alert className="border-green-500/20 bg-green-500/10 backdrop-blur-xl">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300">
              Successfully connected! Your holdings are now synced.
              Trading availability depends on your brokerage's capabilities.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="backdrop-blur-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Skip Option */}
        <div className="text-center">
          <Button 
            variant="ghost" 
            onClick={() => {
              setSkipping(true);
              onComplete();
            }}
            disabled={connecting || connected || skipping}
            className="text-muted-foreground hover:text-foreground transition-colors"
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
