"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LogoLink() {
  const router = useRouter();
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        setIsLoading(true);
        
        // First try localStorage for quick access
        const storedStatus = localStorage.getItem("onboardingStatus");
        if (storedStatus) {
          setOnboardingStatus(storedStatus);
          setIsLoading(false);
          return;
        }
        
        // If not in localStorage, check Supabase using getUser for better security
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (user?.id) {
          const { data: onboardingData } = await supabase
            .from('user_onboarding')
            .select('status')
            .eq('user_id', user.id)
            .single();
            
          if (onboardingData?.status) {
            // Store in localStorage for future checks
            localStorage.setItem("onboardingStatus", onboardingData.status);
            setOnboardingStatus(onboardingData.status);
          }
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkOnboardingStatus();
  }, []);
  
  const handleLogoClick = (e: React.MouseEvent) => {
    // If onboarding is incomplete or not found, redirect to protected page
    if (
      onboardingStatus !== 'submitted' && 
      onboardingStatus !== 'approved'
    ) {
      e.preventDefault();
      router.push('/protected');
    }
    // Otherwise, the default Link behavior will navigate to portfolio
  };
  
  return (
    <Link 
      href="/portfolio" 
      onClick={handleLogoClick}
      className="font-bold"
    >
      <img 
        src="/clera-logo.png" 
        alt="Clera" 
        className="h-8 sm:h-10 w-auto"
      />
    </Link>
  );
} 