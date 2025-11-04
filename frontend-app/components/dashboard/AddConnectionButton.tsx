"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Building2, CheckCircle2, AlertTriangle } from "lucide-react";
import { SnapTradeConnectButton } from "@/components/portfolio/SnapTradeConnectButton";

interface PlaidAccount {
  id: string;
  institution_name: string;
  account_name?: string;
  is_active: boolean;
  last_synced?: string;
}

interface AddConnectionButtonProps {
  userName?: string;
}

export default function AddConnectionButton({ userName = 'User' }: AddConnectionButtonProps) {
  const [connectedAccounts, setConnectedAccounts] = useState<PlaidAccount[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchConnectedAccounts();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Connected Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Connected Accounts Display */
        }
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
          </div>
        ) : connectedAccounts.length > 0 ? (
          <div className="space-y-2">
            {/* Removed count per design update */}
            <div className="space-y-1">
              {connectedAccounts.slice(0, 2).map((account) => (
                <div key={account.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span className="font-medium">{account.institution_name}</span>
                    {account.account_name && (
                      <span className="text-xs text-muted-foreground">({account.account_name})</span>
                    )}
                  </div>
                  <Badge variant={account.is_active ? "default" : "secondary"} className="text-xs">
                    {account.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
              {connectedAccounts.length > 2 && (
                <p className="text-xs text-muted-foreground">
                  +{connectedAccounts.length - 2} more...
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No accounts connected</p>
          </div>
        )}

        {/* Connect Investment Account Button */}
        <div className="border-t pt-3">
          <SnapTradeConnectButton 
            connectionType="trade"
            onSuccess={handleAccountConnected}
            className="w-full shadow-none border-0"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Connect External Brokerage
          </SnapTradeConnectButton>
        </div>
      </CardContent>
    </Card>
  );
}
