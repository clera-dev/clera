"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { redirect } from "next/navigation";
import UserDashboard from "@/components/dashboard/UserDashboard";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{ 
    firstName: string; 
    lastName: string;
  } | null>(null);
  const [accountDetails, setAccountDetails] = useState<{
    bankAccountNumber: string;
    bankRoutingNumber: string;
    transferAmount?: string;
  } | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const supabase = createClient();
        
        // Check auth status
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log("User not authenticated, redirecting to sign-in");
          return redirect("/sign-in");
        }
        
        // Get user data from user_onboarding
        try {
          const { data: onboardingData, error: onboardingError } = await supabase
            .from('user_onboarding')
            .select('onboarding_data')
            .eq('user_id', user.id)
            .single();
          
          if (onboardingData && onboardingData.onboarding_data) {
            const parsedData = typeof onboardingData.onboarding_data === 'string' 
              ? JSON.parse(onboardingData.onboarding_data) 
              : onboardingData.onboarding_data;
            
            console.log("Found user onboarding data:", {
              firstName: parsedData.firstName || "Not found",
              lastName: parsedData.lastName || "Not found"
            });
            
            setUserData({
              firstName: parsedData.firstName || '',
              lastName: parsedData.lastName || ''
            });
          } else {
            // If onboarding data not found, use default values
            console.log("No onboarding data found, using default values");
            setUserData({
              firstName: "User",
              lastName: ""
            });
          }
        } catch (error) {
          console.log("Error fetching onboarding data, using default values:", error);
          setUserData({
            firstName: "User",
            lastName: ""
          });
        }
        
        // Get data from localStorage since we know the tables don't exist
        let localBankAccountNumber = '';
        let localBankRoutingNumber = '';
        let localTransferAmount = '';
        let localAlpacaAccountId = '';
        let localRelationshipId = '';
        let localTransferId = '';
        
        // Run this in a try/catch since localStorage might not be available in SSR
        try {
          localBankAccountNumber = localStorage.getItem('bankAccountNumber') || '';
          localBankRoutingNumber = localStorage.getItem('bankRoutingNumber') || '';
          localTransferAmount = localStorage.getItem('transferAmount') || '';
          localAlpacaAccountId = localStorage.getItem('alpacaAccountId') || '';
          localRelationshipId = localStorage.getItem('relationshipId') || '';
          localTransferId = localStorage.getItem('transferId') || '';
          
          console.log("Found localStorage data:", {
            accountNumber: localBankAccountNumber ? "Present" : "Missing",
            routingNumber: localBankRoutingNumber ? "Present" : "Missing",
            transferAmount: localTransferAmount ? "Present" : "Missing",
            alpacaAccountId: localAlpacaAccountId ? "Present" : "Missing",
            relationshipId: localRelationshipId ? "Present" : "Missing",
            transferId: localTransferId ? "Present" : "Missing"
          });
        } catch (err) {
          console.error("Error accessing localStorage:", err);
        }
        
        // Check if we have localStorage data to use
        const hasLocalData = localBankAccountNumber && localBankRoutingNumber && 
                           localAlpacaAccountId && localRelationshipId;

        if (hasLocalData) {
          // Use localStorage data since the database tables don't exist yet
          console.log("Using localStorage data for account details");
          setAccountDetails({
            bankAccountNumber: localBankAccountNumber,
            bankRoutingNumber: localBankRoutingNumber,
            transferAmount: localTransferAmount || undefined
          });
        } else {
          // No data found, but don't redirect - set default account details
          console.log("No bank data found, but staying on dashboard with defaults");
          setAccountDetails({
            bankAccountNumber: "xxxx-xxxx-0000",
            bankRoutingNumber: "121000358",
            transferAmount: undefined
          });
        }
        
      } catch (error) {
        console.error("Error fetching user data:", error);
        
        // Set some default values instead of redirecting
        setUserData({
          firstName: "User",
          lastName: ""
        });
        
        setAccountDetails({
          bankAccountNumber: "xxxx-xxxx-0000",
          bankRoutingNumber: "121000358",
          transferAmount: undefined
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, []);
  
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
  
  if (!userData || !accountDetails) {
    return redirect("/protected");
  }
  
  return (
    <div className="flex-1 w-full flex flex-col p-4 sm:p-6 md:p-8">
      <UserDashboard 
        firstName={userData.firstName}
        accountDetails={accountDetails}
      />
    </div>
  );
} 