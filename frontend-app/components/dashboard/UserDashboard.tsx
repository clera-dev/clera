"use client";

import { useState, useEffect } from "react";
import { InfoIcon, Terminal } from "lucide-react";
import PortfolioCard from './PortfolioCard';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import ChatButton from "../chat/ChatButton";
import { getAlpacaAccountId, formatCurrency } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface UserDashboardProps {
  firstName: string;
  accountDetails: {
    bankName?: string | null; 
    bankAccountLast4?: string | null;
    latestTransferAmount?: number | null; 
    latestTransferStatus?: string | null;
  } | null;
}

export default function UserDashboard({
  firstName,
  accountDetails
}: UserDashboardProps) {
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [isLoadingAccountId, setIsLoadingAccountId] = useState(true);
  const [accountIdError, setAccountIdError] = useState<string | null>(null);

  useEffect(() => {
    const fetchId = async () => {
      setIsLoadingAccountId(true);
      setAccountIdError(null);
      try {
        const fetchedId = await getAlpacaAccountId();
        if (fetchedId) {
          setAlpacaAccountId(fetchedId);
        } else {
          setAccountIdError("Could not retrieve your Alpaca Account ID. Portfolio and Chat features may be unavailable.");
        }
      } catch (err) {
        console.error("Error fetching Alpaca Account ID in UserDashboard:", err);
        setAccountIdError("Failed to load account details. Please try refreshing.");
      } finally {
        setIsLoadingAccountId(false);
      }
    };
    fetchId();
  }, []);

  const displayBankName = accountDetails?.bankName || "Not Connected";
  const displayLast4 = accountDetails?.bankAccountLast4 ? `•••• ${accountDetails.bankAccountLast4}` : "N/A";
  const displayTransferAmount = accountDetails?.latestTransferAmount 
    ? formatCurrency(accountDetails.latestTransferAmount)
    : null;
  const displayTransferStatus = accountDetails?.latestTransferStatus;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Hello, {firstName}</h1>
      <p className="text-muted-foreground">Welcome to your Clera account dashboard.</p>
      
      {accountIdError && (
          <Alert variant="default" className="mb-4">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Account Access Issue</AlertTitle>
              <AlertDescription>
                  {accountIdError}
              </AlertDescription>
          </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium">Bank Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bank Name</span>
                <span className="font-medium">{displayBankName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Account (Last 4)</span>
                <span className="font-medium">{displayLast4}</span>
              </div>
              {displayTransferAmount !== null && (
                <div className="flex items-center justify-between pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Latest Transfer</span>
                  <span className="font-medium">
                    {displayTransferAmount}
                    {displayTransferStatus && <span className="text-xs text-muted-foreground ml-1">({displayTransferStatus})</span>}
                  </span>
                </div>
              )}
               {displayBankName === "Not Connected" && (
                 <p className="text-sm text-muted-foreground pt-2 border-t mt-2">
                    Connect a bank account to enable funding.
                 </p>
               )} 
            </div>
          </CardContent>
        </Card>
        
        {isLoadingAccountId ? (
            <Card>
                <CardHeader className="pb-2">
                    <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        ) : alpacaAccountId ? (
            <PortfolioCard alpacaAccountId={alpacaAccountId} />
        ) : (
             <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-medium">Portfolio</CardTitle>
                </CardHeader>
                <CardContent>
                   <p className="text-sm text-muted-foreground">Account ID not available.</p>
                </CardContent>
            </Card>
        )}
      </div>
      
      {!isLoadingAccountId && alpacaAccountId && <ChatButton accountId={alpacaAccountId} />}
    </div>
  );
}

/*
  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">
          Hi, {firstName}, my name is Clera.
        </h1>
        <p className="text-lg text-muted-foreground">
          Your account has been successfully funded and is ready for trading.
        </p>
      </div>
      
      <div className="bg-card rounded-lg border p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Bank Account Details</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Account Number</p>
            <p className="font-medium">
              •••• •••• {accountDetails.bankAccountNumber.slice(-4)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Routing Number</p>
            <p className="font-medium">{accountDetails.bankRoutingNumber}</p>
          </div>
          {accountDetails.transferAmount && (
            <div>
              <p className="text-sm text-muted-foreground">Initial Funding Amount</p>
              <p className="font-medium">${accountDetails.transferAmount}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-accent p-4 rounded-lg flex items-start gap-3">
        <InfoIcon className="text-accent-foreground mt-1" size={18} />
        <div>
          <p className="text-accent-foreground font-medium">
            What's Next?
          </p>
          <p className="text-accent-foreground text-sm mt-1">
            Your account is being funded. This process typically takes 1-3 business days.
            Once completed, you can start trading.
          </p>
        </div>
      </div>
    </div>
  );
} 
  */