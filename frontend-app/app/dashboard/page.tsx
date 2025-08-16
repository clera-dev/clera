"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import UserDashboard from "@/components/dashboard/UserDashboard";
import BankAccountDetails from "@/components/dashboard/BankAccountDetails";
import BankConnectionsCard from "@/components/dashboard/BankConnectionsCard";
import OrderHistory from "@/components/dashboard/OrderHistory";
import DocumentsAndStatements from "@/components/dashboard/DocumentsAndStatements";
import DangerZone from "@/components/account/DangerZone";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAlpacaAccountId } from "@/lib/utils"; // Import reliable account ID utility
import TransferHistory from "@/components/funding/TransferHistory";
import GoalsSection from "@/components/dashboard/GoalsSection";

// Define a more accurate type for account details based on Supabase fetch
interface FetchedAccountDetails {
  bankName?: string | null; 
  bankAccountLast4?: string | null;
  latestTransferAmount?: number | null; 
  latestTransferStatus?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<{ 
    firstName: string; 
    lastName: string;
  } | null>(null);
  const [accountDetails, setAccountDetails] = useState<FetchedAccountDetails | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
          router.push("/sign-in");
          return; 
        }
        
        // Save user email and ID for future use
        setUserEmail(user.email || null);
        setUserId(user.id);
        
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
              setAlpacaAccountId(alpacaId);
              
              // RELIABILITY FIX: Removed localStorage caching - Supabase is the source of truth
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
            } else {
                 
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
            } else {
                 
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
        setError("Some account information may be incomplete. Please try again later.");
        
        // Try to recover using more reliable sources
        try {
          const storedFirstName = localStorage.getItem('firstName') || "User";
          setUserData({ firstName: storedFirstName, lastName: "" });
          
          // RELIABILITY FIX: Use Supabase-based account ID instead of localStorage fallback
          try {
            const fallbackAccountId = await getAlpacaAccountId();
            if (fallbackAccountId) setAlpacaAccountId(fallbackAccountId);
          } catch (accountErr) {
            console.warn("Could not recover account ID:", accountErr);
          }
          
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
                    <Button variant="link" className="p-0 h-auto mt-2" onClick={() => router.refresh()}>Try Reloading</Button>
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
    <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-4 space-y-6 flex-1 w-full flex flex-col">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Account Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your account settings and view statements</p>
          </div>
        </div>

        {error && (
          <Alert className="mb-6">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>
              Some account information may be incomplete. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content Grid */}
        <div className="space-y-6">
          {/* Row 1: Personal Info and Bank Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <UserDashboard
                firstName={userData.firstName}
                lastName={userData.lastName}
                email={userEmail || ""}
                accountDetails={accountDetails || {}}
                alpacaAccountId={alpacaAccountId}
              />
            </div>
            <div className="space-y-1.5">
              <BankAccountDetails accountDetails={accountDetails || {}} />
              <BankConnectionsCard
                alpacaAccountId={alpacaAccountId || undefined}
                email={userEmail || undefined}
                userName={userData.firstName}
              />
            </div>
          </div>

          {/* Row 2: Order History and Transfer History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OrderHistory />
            <TransferHistory />
          </div>

          {/* Row 3: Goals Section */}
          <div className="grid grid-cols-1 gap-6">
            <GoalsSection 
              userId={userId || ''} 
              firstName={userData?.firstName}
            />
          </div>

          {/* Row 4: Documents and Disclosures */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DocumentsAndStatements />
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Required Disclosures</h3>
              <p className="text-sm text-muted-foreground mb-4">
                The following disclosures are provided for your reference and regulatory compliance.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <a href="https://files.alpaca.markets/disclosures/library/UseAndRisk.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Use and Risk Disclosures</a>
                  <a href="https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Terms and Conditions</a>
                  <a href="https://files.alpaca.markets/disclosures/library/PrivacyNotice.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Privacy Notice</a>
                  <a href="https://files.alpaca.markets/disclosures/library/PFOF.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Payment for Order Flow Disclosure</a>
                </div>
                <div className="space-y-3">
                  <a href="https://files.alpaca.markets/disclosures/library/MarginDiscStmt.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Margin Disclosure Statement</a>
                  <a href="https://files.alpaca.markets/disclosures/library/ExtHrsRisk.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Extended Hours Risk Disclosure</a>
                  <a href="https://files.alpaca.markets/disclosures/library/BCPSummary.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Business Continuity Plan Summary</a>
                  <a href="https://files.alpaca.markets/disclosures/library/FormCRS.pdf" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">Form CRS</a>
                </div>
              </div>
            </div>
          </div>

          {/* Row 5: Account Management */}
          {alpacaAccountId && (
            <div className="mt-8">
              <DangerZone
                accountId={alpacaAccountId}
                userName={userData.firstName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 