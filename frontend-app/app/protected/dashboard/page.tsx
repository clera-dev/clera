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
          return redirect("/sign-in");
        }
        
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setUserData({
            firstName: profile.first_name || '',
            lastName: profile.last_name || ''
          });
        }
        
        // Get bank account details from localStorage
        const bankAccountNumber = localStorage.getItem('bankAccountNumber') || '';
        const bankRoutingNumber = localStorage.getItem('bankRoutingNumber') || '';
        const transferAmount = localStorage.getItem('transferAmount') || '';
        
        if (bankAccountNumber && bankRoutingNumber) {
          setAccountDetails({
            bankAccountNumber,
            bankRoutingNumber,
            transferAmount: transferAmount || undefined
          });
        } else {
          // If no bank details in localStorage, redirect back to protected page
          redirect("/protected");
        }
        
      } catch (error) {
        console.error("Error fetching user data:", error);
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