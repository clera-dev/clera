"use client";

import { useState, useEffect } from "react";
import { Terminal, User, Mail, Shield, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
    getAlpacaAccountId
} from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/utils/supabase/client";

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
}

export default function UserDashboard({
  firstName,
  lastName,
  email,
  accountDetails
}: UserDashboardProps) {
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [isLoadingAccountId, setIsLoadingAccountId] = useState(true);
  const [accountIdError, setAccountIdError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccountInfo = async () => {
      setIsLoadingAccountId(true);
      setAccountIdError(null);
      try {
        // Try to get the Alpaca Account ID using the utility function
        const fetchedId = await getAlpacaAccountId();
        
        if (fetchedId) {
          setAlpacaAccountId(fetchedId);
        } else {
          // Fallback: Try to directly fetch from Supabase if the utility function fails
          console.log("Attempting direct DB fallback for Alpaca ID");
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            setAccountCreated(user.created_at);
            
            const { data: onboardingData } = await supabase
              .from('user_onboarding')
              .select('alpaca_account_id, onboarding_data')
              .eq('user_id', user.id)
              .single();
              
            if (onboardingData?.alpaca_account_id) {
              console.log("Direct DB fetch successful:", onboardingData.alpaca_account_id);
              setAlpacaAccountId(onboardingData.alpaca_account_id);
              // Store for future use
              try {
                localStorage.setItem('alpacaAccountId', onboardingData.alpaca_account_id);
              } catch (e) { console.error("LocalStorage Error:", e); }
            } else {
              setAccountIdError("Could not retrieve your Alpaca Account ID. Portfolio and Chat features may be unavailable.");
            }
          } else {
            setAccountIdError("User authentication required. Please sign in again.");
          }
        }
      } catch (err) {
        console.error("Error fetching Alpaca Account ID in UserDashboard:", err);
        setAccountIdError("Failed to load account details. Please try refreshing.");
      } finally {
        setIsLoadingAccountId(false);
      }
    };
    fetchAccountInfo();
  }, []);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        return 'bg-green-500';
      case 'SUBMITTED':
      case 'PENDING':
        return 'bg-yellow-500';
      case 'INACTIVE':
      case 'CLOSED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hello, {firstName}</h1>
        <p className="text-muted-foreground">Welcome to your account dashboard.</p>
      </div>
      
      {accountIdError && (
          <Alert variant="default" className="mb-4">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Account Access Issue</AlertTitle>
              <AlertDescription>
                  {accountIdError}
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
                <span className={`inline-block h-2 w-2 rounded-full ${getStatusColor('ACTIVE')}`} />
                <p className="text-base font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  ACTIVE
                </p>
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