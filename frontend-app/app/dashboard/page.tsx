"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import UserDashboard from "@/components/dashboard/UserDashboard";
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

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        
        // 1. Check auth status
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.log("User not authenticated, redirecting to sign-in");
          window.location.href = "/sign-in";
          return; 
        }
        
        // 2. Get user first/last name from user_onboarding
        let firstName = "User";
        let lastName = "";
        try {
          const { data: onboardingData, error: onboardingError } = await supabase
            .from('user_onboarding')
            .select('onboarding_data') 
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (onboardingError) {
            console.warn("Warning fetching onboarding data:", onboardingError.message);
          }

          if (onboardingData && onboardingData.onboarding_data) {
            const parsedData = typeof onboardingData.onboarding_data === 'string' 
              ? JSON.parse(onboardingData.onboarding_data) 
              : onboardingData.onboarding_data;
            
            firstName = parsedData?.firstName || firstName;
            lastName = parsedData?.lastName || lastName;
          }
          setUserData({ firstName, lastName });
          console.log("Dashboard: User name data set:", { firstName, lastName });

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
                 console.log("Dashboard: No bank connection found for user.");
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
                 console.log("Dashboard: No transfer data found for user.");
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
        setUserData(null);
        setAccountDetails(null);
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
  
  if (error) {
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
      <UserDashboard 
        firstName={userData.firstName}
        accountDetails={accountDetails || {}}
      />
    </div>
  );
} 