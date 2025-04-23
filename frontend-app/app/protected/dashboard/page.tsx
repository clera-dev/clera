"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { redirect } from "next/navigation";
import UserDashboard from "@/components/dashboard/UserDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { getAlpacaAccountId } from "@/lib/utils"; // Import the utility

// Define the structure for account details we expect
interface AccountSummaryDetails {
  bankName?: string | null;
  bankAccountLast4?: string | null;
  latestTransferAmount?: number | null; // Keep for future implementation
  latestTransferStatus?: string | null; // Keep for future implementation
}

// --- Helper function to fetch account summary with caching ---
async function fetchAccountSummary(alpacaAccountId: string): Promise<AccountSummaryDetails | null> {
  const cacheKey = `dashboardAccountDetails_${alpacaAccountId}`;
  
  // 1. Check localStorage cache
  try {
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      console.log("Using cached account summary details.");
      // TODO: Add TTL logic if needed
      return JSON.parse(cachedData) as AccountSummaryDetails;
    }
  } catch (error) {
    console.error("Error reading account summary from cache:", error);
  }

  // 2. Fetch from API if no cache
  console.log(`Fetching account summary details for account: ${alpacaAccountId}`);
  try {
    // IMPORTANT: This API route needs to be created!
    const response = await fetch(`/api/broker/account-summary?accountId=${alpacaAccountId}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Failed to fetch account summary: ${response.statusText}`);
    }
    const summaryData = await response.json() as AccountSummaryDetails;

    // 3. Store fetched data in localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify(summaryData));
    } catch (error) {
      console.error("Error saving account summary to cache:", error);
    }

    return summaryData;
  } catch (error) {
    console.error("Error fetching account summary from API:", error);
    return null; // Return null on fetch error
  }
}
// --- End Helper Function ---

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alpacaAccountId, setAlpacaAccountId] = useState<string | null>(null);
  const [userData, setUserData] = useState<{ 
    firstName: string; 
    lastName: string;
  } | null>(null);
  const [accountDetails, setAccountDetails] = useState<AccountSummaryDetails | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setErrorMessage(null);
      let fetchedAccountId: string | null = null;

      try {
        // --- Step 1: Get User & Profile ---
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error("Auth error or no user:", authError);
          return redirect("/sign-in");
        }
        
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
          setUserData({ firstName: 'User', lastName: '' }); // Fallback
        } else if (profile) {
          setUserData({ firstName: profile.first_name || 'User', lastName: profile.last_name || '' });
        } else {
           console.warn("No profile found for user:", user.id);
           setUserData({ firstName: 'User', lastName: '' }); // Fallback
        }

        // --- Step 2: Get Alpaca Account ID ---
        fetchedAccountId = await getAlpacaAccountId(); 
        if (!fetchedAccountId) {
          console.error("Alpaca Account ID not found.");
          setErrorMessage("Could not find your linked Alpaca account. Please ensure onboarding is complete.");
          // Don't redirect, allow dashboard to show minimal info/error
        } else {
            setAlpacaAccountId(fetchedAccountId);
            // --- Step 3: Fetch Account Summary (using ID) ---
            const summary = await fetchAccountSummary(fetchedAccountId);
            if (!summary) {
                console.error("Failed to fetch or parse account summary.");
                setErrorMessage("Could not load account details. Please try again later.");
            }
            setAccountDetails(summary);
        }
        
      } catch (error) { // Catch errors from getAlpacaAccountId or fetchAccountSummary
        console.error("Error during dashboard data fetching sequence:", error);
        setErrorMessage("An unexpected error occurred while loading dashboard data.");
        // Ensure states reflect error
        if (!userData) setUserData({ firstName: 'Error', lastName: '' }); 
        setAccountDetails(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);
  
  // --- Render Logic ---
  if (loading) {
    return (
      <div className="flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <Skeleton className="h-32 w-full mb-8" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  
  // Handle case where user profile failed to load (redirect earlier handles !user)
  if (!userData) { 
    return (
        <div className="flex-1 w-full flex items-center justify-center">
            <p>{errorMessage || "Error loading user data. Please try logging in again."}</p>
        </div>
    ); 
  }
  
  // User data loaded, now render dashboard. 
  // UserDashboard component should handle cases where accountDetails is null or partially loaded.
  return (
    <div className="flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8">
       {/* Display error message if fetching account details failed */} 
       {errorMessage && !accountDetails && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <span className="block sm:inline">{errorMessage}</span>
            </div>
       )}
      <UserDashboard 
        firstName={userData.firstName}
        // Pass accountDetails directly, let the component handle null/undefined fields
        accountDetails={accountDetails} 
      />
    </div>
  );
} 