"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Terminal, User, Mail, Shield, Clock, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
    getAlpacaAccountId
} from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/utils/supabase/client";
import { formatAccountStatus, getAccountStatusColor, getAccountStatusTooltip } from "@/lib/utils/accountStatus";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface UserDashboardProps {
  firstName: string;
  lastName: string;
  email: string;
  accountDetails: {
    bankName?: string | null; 
    bankAccountLast4?: string | null;
    latestTransferAmount?: number | null; 
    latestTransferStatus?: string | null;
  } | null;
  alpacaAccountId: string | null;
}

export default function UserDashboard({
  firstName,
  lastName,
  email,
  accountDetails,
  alpacaAccountId
}: UserDashboardProps) {
  const supabase = createClient();
  const router = useRouter();
  const [accountCreated, setAccountCreated] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  
  // Fetch account status from API
  const fetchAccountStatus = useCallback(async () => {
    if (!alpacaAccountId) {
      setStatusError("No account ID available");
      setIsLoadingStatus(false);
      return;
    }

    try {
      setStatusError(null);
      
      const response = await fetch(`/api/account/${alpacaAccountId}/status`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch account status');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setAccountStatus(result.data.status);
      } else {
        throw new Error(result.error || 'Invalid response format');
      }

    } catch (err) {
      console.error('Error fetching account status:', err);
      setStatusError(err instanceof Error ? err.message : 'Failed to fetch account status');
      // Fallback to a default status
      setAccountStatus('ACTIVE');
    } finally {
      setIsLoadingStatus(false);
    }
  }, [alpacaAccountId]);

  // Get account created date
  useEffect(() => {
    const fetchAccountCreated = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setAccountCreated(user.created_at);
        }
      } catch (err) {
        console.error("Error fetching account created date:", err);
      }
    };
    fetchAccountCreated();
  }, []);

  // Set up account status monitoring
  useEffect(() => {
    if (!alpacaAccountId) return;

    // Initial fetch
    fetchAccountStatus();

    // Set up real-time subscription for account status changes
    const subscription = supabase
      .channel('account-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_onboarding',
          filter: `alpaca_account_id=eq.${alpacaAccountId}`
        },
        (payload) => {
          console.log('Account status updated via real-time subscription:', payload);
          
          if (payload.new && payload.new.alpaca_account_status) {
            setAccountStatus(payload.new.alpaca_account_status);
            setStatusError(null);
          }
        }
      )
      .subscribe((status) => {
        console.log('Account status subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [alpacaAccountId, fetchAccountStatus]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };



  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hello, {firstName}</h1>
        <p className="text-muted-foreground">Welcome to your account dashboard.</p>
      </div>
      
      {statusError && (
          <Alert variant="default" className="mb-4">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Account Status Issue</AlertTitle>
              <AlertDescription>
                  {statusError}
              </AlertDescription>
          </Alert>
      )}

      {/* Personal Information Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Full Name</p>
              <p className="text-base font-medium">
                {firstName} {lastName}
              </p>
            </div>

            {/* Email */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Email Address</p>
              <p className="text-base font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {email}
              </p>
            </div>

            {/* Account Number */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Account Number</p>
              <p className="text-base font-medium font-mono">
                {alpacaAccountId || 'Loading...'}
              </p>
            </div>

            {/* Account Status */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Account Status</p>
              <div className="flex items-center gap-2">
                {isLoadingStatus ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-base font-medium">Loading...</span>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 cursor-help">
                        <span className={`inline-block h-2 w-2 rounded-full ${getAccountStatusColor(accountStatus)}`} />
                        <p className="text-base font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          {formatAccountStatus(accountStatus)}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {getAccountStatusTooltip(accountStatus)}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Account Created */}
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-muted-foreground mb-1">Account Created</p>
              <p className="text-base font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {formatDate(accountCreated)}
              </p>
            </div>
          </div>
          
          {/* Update Information Button */}
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => router.push('/account/update-information')}
              className="w-full md:w-auto"
            >
              Update Information
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              View and update your personal information
            </p>
          </div>
        </CardContent>
      </Card>
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