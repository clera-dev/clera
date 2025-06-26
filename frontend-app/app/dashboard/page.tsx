"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import UserDashboard from "@/components/dashboard/UserDashboard";
import BankAccountDetails from "@/components/dashboard/BankAccountDetails";
import BankConnectionsCard from "@/components/dashboard/BankConnectionsCard";
import DangerZone from "@/components/account/DangerZone";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

// Define a more accurate type for account details based on Supabase fetch
interface FetchedAccountDetails {
  bankName?: string | null; 
  bankAccountLast4?: string | null;
  latestTransferAmount?: number | null; 
  latestTransferStatus?: string | null;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<{ 
    firstName: string; 
    lastName: string;
  } | null>(null);
  const [accountDetails, setAccountDetails] = useState<FetchedAccountDetails | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        
        // 1. Check auth status using getUser (more secure than getSession)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.log("User not authenticated, redirecting to sign-in");
          window.location.href = "/sign-in";
          return; 
        }
        
        // Save user email for future use
        setUserEmail(user.email || null);
        
        // 2. Get user first/last name and alpaca account ID from user_onboarding
        let firstName = "User";
        let lastName = "";
        let alpacaId = null;
        try {
          const { data: onboardingData, error: onboardingError } = await supabase
            .from('user_onboarding')
            .select('onboarding_data, alpaca_account_id') 
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (onboardingError) {
            console.warn("Warning fetching onboarding data:", onboardingError.message);
          }

          if (onboardingData) {
            if (onboardingData.onboarding_data) {
              const parsedData = typeof onboardingData.onboarding_data === 'string' 
                ? JSON.parse(onboardingData.onboarding_data) 
                : onboardingData.onboarding_data;
              
              firstName = parsedData?.firstName || firstName;
              lastName = parsedData?.lastName || lastName;
            }
            
            alpacaId = onboardingData.alpaca_account_id;
            if (alpacaId) {
              console.log(`Found Alpaca account ID: ${alpacaId}`);
              setAlpacaAccountId(alpacaId);
              
              // Store in localStorage for access by other components
              try {
                localStorage.setItem('alpacaAccountId', alpacaId);
              } catch (e) {
                console.error("Error storing alpacaAccountId in localStorage:", e);
              }
            } else {
              console.warn("No Alpaca account ID found in onboarding data");
            }
          }
          setUserData({ firstName, lastName });

        } catch (err) {
          console.error("Error processing onboarding data:", err);
          setUserData({ firstName: "User", lastName: "" });
        }

        // 3. Fetch latest bank connection details
        let bankName: string | null = null;
        let bankAccountLast4: string | null = null;
        try {
            const { data: bankData, error: bankError } = await supabase
                .from('user_bank_connections')
                .select('bank_name, last_4')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (bankError) {
                console.warn("Warning fetching bank connection:", bankError.message);
            }
            if (bankData) {
                bankName = bankData.bank_name;
                bankAccountLast4 = bankData.last_4;
                console.log("Dashboard: Bank details found:", { bankName, bankAccountLast4 });
            } else {
                 console.log("Dashboard: No bank connection found in database");
                 
                 // Try to get from localStorage as fallback
                 try {
                   const storedBankName = localStorage.getItem('bankName');
                   const storedLast4 = localStorage.getItem('bankLast4');
                   if (storedBankName) bankName = storedBankName;
                   if (storedLast4) bankAccountLast4 = storedLast4;
                 } catch (e) {
                   console.error("Error reading bank data from localStorage:", e);
                 }
            }
        } catch (err) {
             console.error("Error fetching bank connection details:", err);
        }

        // 4. Fetch latest transfer details
        let latestTransferAmount: number | null = null;
        let latestTransferStatus: string | null = null;
        try {
            const { data: transferData, error: transferError } = await supabase
                .from('user_transfers')
                .select('amount, status')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (transferError) {
                 console.warn("Warning fetching transfer data:", transferError.message);
            }
            if (transferData) {
                latestTransferAmount = transferData.amount;
                latestTransferStatus = transferData.status;
                console.log("Dashboard: Transfer details found:", { latestTransferAmount, latestTransferStatus });
            } else {
                 console.log("Dashboard: No transfer data found in database");
                 
                 // Try to get from localStorage as fallback
                 try {
                   const storedAmount = localStorage.getItem('transferAmount');
                   if (storedAmount) {
                     latestTransferAmount = parseFloat(storedAmount);
                     latestTransferStatus = "PENDING"; // Default status for localStorage data
                   }
                 } catch (e) {
                   console.error("Error reading transfer data from localStorage:", e);
                 }
            }
        } catch (err) {
            console.error("Error fetching transfer details:", err);
        }

        // 5. Set the combined account details state
        setAccountDetails({
            bankName,
            bankAccountLast4,
            latestTransferAmount,
            latestTransferStatus
        });
        
      } catch (err: any) {
        console.error("Error fetching dashboard data:", err);
        setError(err.message || "Failed to load dashboard data.");
        
        // Try to recover using localStorage data
        try {
          const storedFirstName = localStorage.getItem('firstName') || "User";
          setUserData({ firstName: storedFirstName, lastName: "" });
          
          const storedAccountId = localStorage.getItem('alpacaAccountId');
          if (storedAccountId) setAlpacaAccountId(storedAccountId);
          
          // Set minimal account details from localStorage
          setAccountDetails({
            bankName: localStorage.getItem('bankName'),
            bankAccountLast4: localStorage.getItem('bankLast4'),
            latestTransferAmount: localStorage.getItem('transferAmount') ? 
              parseFloat(localStorage.getItem('transferAmount')!) : null,
            latestTransferStatus: "PENDING"
          });
        } catch (storageErr) {
          console.error("Failed to recover from localStorage:", storageErr);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);
  
  if (loading) {
    return (
      <div className="flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8">
        <Skeleton className="h-10 w-1/2 mb-4" /> 
        <Skeleton className="h-6 w-1/3 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  
  if (error && !userData) {
      return (
        <div className="flex items-center justify-center h-full p-4">
            <Alert variant="destructive" className="max-w-md">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error Loading Dashboard</AlertTitle>
                <AlertDescription>
                    {error}
                    <br />
                    <Button variant="link" className="p-0 h-auto mt-2" onClick={() => window.location.reload()}>Try Reloading</Button>
                </AlertDescription>
            </Alert>
        </div>
     );
  }

  if (!userData) {
     return (
         <div className="flex items-center justify-center h-full p-4">
             <p className="text-muted-foreground">Could not load user information. Please try refreshing.</p>
         </div>
     );
  }
  
  return (
    <div className="flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8">
      {error && (
        <Alert className="mb-6">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>
            Some account information may be incomplete. {error}
          </AlertDescription>
        </Alert>
      )}
      
      <UserDashboard 
        firstName={userData.firstName}
        lastName={userData.lastName}
        email={userEmail || ""}
        accountDetails={accountDetails || {}}
      />
      
      {/* Bank Account Details */}
      <div className="mt-6">
        <BankAccountDetails 
          accountDetails={accountDetails || {}}
        />
      </div>
      
      {/* Add Funds Button */}
      <div className="mt-6">
        <BankConnectionsCard 
          alpacaAccountId={alpacaAccountId || undefined}
          email={userEmail || undefined}
          userName={userData.firstName}
        />
      </div>
      
      {/* Danger Zone - Account Closure */}
      <div className="mt-6">
        <DangerZone 
          accountId={alpacaAccountId || ""}
          userName={userData.firstName}
        />
      </div>
    </div>
  );
} 