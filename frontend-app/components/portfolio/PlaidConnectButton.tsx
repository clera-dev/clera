"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Plus, ExternalLink, Building2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PlaidAccount {
  id: string;
  institution_name: string;
  account_name?: string;
  is_active: boolean;
  last_synced?: string;
}

interface PlaidConnectButtonProps {
  onAccountConnected?: () => void;
  className?: string;
  showCard?: boolean; // if false, render only the button (for inline use)
}

export default function PlaidConnectButton({ 
  onAccountConnected, 
  className = "",
  showCard = true,
}: PlaidConnectButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<PlaidAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({}) // Send empty object instead of no body
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Link token API error:', response.status, errorText);
        throw new Error(`Failed to create link token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Link token response:', data);
      
      if (data.success && data.link_token) {
        setLinkToken(data.link_token);
      } else {
        console.error('Link token creation failed:', data);
        throw new Error(data.error || 'Failed to create link token');
      }
    } catch (err) {
      console.error('Error creating link token:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize account connection');
    }
  }, []);

  // Handle successful account connection
  const onSuccessCallback = async (publicToken: string, metadata: any) => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔗 Plaid Link success:', { publicToken, metadata });

      // Exchange public token for access token
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
      console.log('✅ Token exchange result:', result);

      // Refresh connected accounts list
      await fetchConnectedAccounts();
      
      // Notify parent component
      if (onAccountConnected) {
        onAccountConnected();
      }

    } catch (err) {
      console.error('Error connecting account:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  };

  // Handle Plaid Link exit (errors and user cancellation)
  const onExitCallback = (err: any, metadata: any) => {
    console.log('Plaid Link exit:', { err, metadata });
    setLoading(false);
    
    if (err) {
      console.error('Plaid Link error:', err);
      setError(err.error_message || err.message || 'Connection cancelled');
    }
  };

  // Fetch connected accounts
  const fetchConnectedAccounts = async () => {
    try {
      const response = await fetch('/api/test/user/investment-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}) // Send empty object to prevent JSON parsing errors
      });

      if (response.ok) {
        const data = await response.json();
        setConnectedAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('Error fetching connected accounts:', err);
    }
  };

  // Configure Plaid Link with conditional loading to prevent duplicates
  const config = {
    token: linkToken || '',  // Use empty string instead of null
    onSuccess: onSuccessCallback,
    onExit: onExitCallback,
  };

  const { open, ready } = usePlaidLink(config);

  // Initialize on component mount
  useEffect(() => {
    createLinkToken();
    fetchConnectedAccounts();
  }, [createLinkToken]);

  const ConnectButton = (
    <Button
      onClick={() => ready && linkToken ? open() : createLinkToken()}
      disabled={loading || !linkToken}
      className="w-full"
      variant={connectedAccounts.length > 0 ? "outline" : "default"}
    >
      <Plus className="h-4 w-4 mr-2" />
      {loading ? 'Connecting...' : 'Connect Investment Account'}
      <ExternalLink className="h-4 w-4 ml-2" />
    </Button>
  );

  if (!showCard) {
    return ConnectButton;
  }

  return (
    <Card className={`bg-card shadow-sm border ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5" />
          Investment Account Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        {connectedAccounts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Connected Accounts:</p>
            <div className="grid gap-2">
              {connectedAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between p-2 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium text-sm">{account.institution_name}</span>
                    {account.account_name && (
                      <span className="text-xs text-muted-foreground">({account.account_name})</span>
                    )}
                  </div>
                  <Badge variant={account.is_active ? "default" : "secondary"} className="text-xs">
                    {account.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connect Account Button */}
        <div className="flex flex-col gap-2">{ConnectButton}</div>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {connectedAccounts.length === 0 && !error && (
          <div className="text-center py-6 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium mb-1">No accounts connected yet</p>
            <p className="text-xs">Connect your investment accounts to see your complete portfolio</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
