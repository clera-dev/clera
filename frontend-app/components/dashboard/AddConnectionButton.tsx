"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Building2, CheckCircle2, X, AlertTriangle, Loader2 } from "lucide-react";
import { SnapTradeConnectButton } from "@/components/portfolio/SnapTradeConnectButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import toast from 'react-hot-toast';

interface ConnectedAccount {
  id: string;
  provider_account_id: string;
  institution_name: string;
  account_name?: string;
  is_active: boolean;
  last_synced?: string;
}

interface AddConnectionButtonProps {
  userName?: string;
}

export default function AddConnectionButton({ userName = 'User' }: AddConnectionButtonProps) {
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingAccount, setDisconnectingAccount] = useState<ConnectedAccount | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Fetch connected accounts
  const fetchConnectedAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/test/user/investment-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setConnectedAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching connected accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountConnected = () => {
    fetchConnectedAccounts();
  };

  const handleDisconnectClick = (account: ConnectedAccount) => {
    setDisconnectingAccount(account);
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectingAccount) return;
    
    setIsDisconnecting(true);
    
    try {
      const response = await fetch(
        `/api/snaptrade/disconnect-account/${disconnectingAccount.provider_account_id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const result = await response.json();
        toast.success(`${disconnectingAccount.institution_name} account disconnected`);
        // Refresh the accounts list
        fetchConnectedAccounts();
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(error.error || 'Failed to disconnect account');
      }
    } catch (error) {
      console.error('Error disconnecting account:', error);
      toast.error('Failed to disconnect account. Please try again.');
    } finally {
      setIsDisconnecting(false);
      setDisconnectingAccount(null);
    }
  };

  const handleDisconnectCancel = () => {
    setDisconnectingAccount(null);
  };

  useEffect(() => {
    fetchConnectedAccounts();
  }, []);

  // Determine which accounts to show
  const displayedAccounts = showAllAccounts 
    ? connectedAccounts 
    : connectedAccounts.slice(0, 3);
  const hasMoreAccounts = connectedAccounts.length > 3;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Connected Accounts
            </div>
            {connectedAccounts.length > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {connectedAccounts.length} {connectedAccounts.length === 1 ? 'account' : 'accounts'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Connected Accounts Display */}
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded" />
              <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
            </div>
          ) : connectedAccounts.length > 0 ? (
            <div className="space-y-2">
              <div className="space-y-2">
                {displayedAccounts.map((account) => (
                  <div 
                    key={account.id} 
                    className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium truncate block">
                          {account.institution_name}
                        </span>
                        {account.account_name && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {account.account_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge 
                        variant={account.is_active ? "default" : "secondary"} 
                        className="text-xs hidden sm:inline-flex"
                      >
                        {account.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDisconnectClick(account)}
                        title="Disconnect account"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Show more/less toggle */}
              {hasMoreAccounts && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAllAccounts(!showAllAccounts)}
                >
                  {showAllAccounts 
                    ? 'Show less' 
                    : `+${connectedAccounts.length - 3} more accounts`
                  }
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <Building2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No accounts connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect your brokerage to get started
              </p>
            </div>
          )}

          {/* Connect Investment Account Button */}
          <div className="border-t pt-3">
            <SnapTradeConnectButton 
              connectionType="trade"
              onSuccess={handleAccountConnected}
              className="w-full shadow-none"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              {connectedAccounts.length > 0 
                ? 'Connect Another Account' 
                : 'Connect Brokerage Account'
              }
            </SnapTradeConnectButton>
          </div>
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={!!disconnectingAccount} onOpenChange={handleDisconnectCancel}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle className="text-lg">
                Disconnect Account?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm">
              Are you sure you want to disconnect your{' '}
              <span className="font-semibold text-foreground">
                {disconnectingAccount?.institution_name}
              </span>
              {disconnectingAccount?.account_name && (
                <span className="text-muted-foreground">
                  {' '}({disconnectingAccount.account_name})
                </span>
              )}{' '}
              account?
            </AlertDialogDescription>
            
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>What happens when you disconnect:</strong>
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-1 list-disc list-inside">
                <li>Holdings from this account will be removed from your portfolio</li>
                <li>You won&apos;t be able to trade from this account</li>
                <li>You can reconnect anytime to restore access</li>
              </ul>
            </div>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4">
            <AlertDialogCancel 
              disabled={isDisconnecting}
              className="w-full sm:w-auto"
            >
              No, keep connected
            </AlertDialogCancel>
            {/* Use Button instead of AlertDialogAction to prevent auto-close during async operation */}
            <Button
              onClick={handleDisconnectConfirm}
              disabled={isDisconnecting}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Yes, disconnect'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
