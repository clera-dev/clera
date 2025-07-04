"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import LogoLink from '@/components/LogoLink';

export default function ConditionalLogoLink() {
  const pathname = usePathname();
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pages where we don't want to show the logo (except for special cases)
  const hideLogoPages = ['/dashboard', '/account', '/chat', '/invest', '/portfolio', '/news', '/info', '/settings', '/protected'];
  
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: onboardingData } = await supabase
            .from('user_onboarding')
            .select('status')
            .eq('user_id', user.id)
            .single();
          
          setUserStatus(onboardingData?.status || null);
        }
      } catch (error) {
        console.error('Error checking user status:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkUserStatus();
  }, []);
  
  // Check if current path starts with any of the paths where we don't want to show the logo
  const shouldHideLogoBasedOnPath = hideLogoPages.some(page => pathname?.startsWith(page));
  
  // Special case: Always show logo for users with pending_closure or closed status on /protected
  const isAccountClosurePage = pathname?.startsWith('/protected') && (userStatus === 'pending_closure' || userStatus === 'closed');
  
  // Show logo if:
  // 1. Path is not in hide list, OR
  // 2. User is on account closure page (pending_closure/closed status on /protected)
  const shouldShowLogo = !shouldHideLogoBasedOnPath || isAccountClosurePage;
  
  if (isLoading || !shouldShowLogo) {
    return null;
  }
  
  return <LogoLink />;
} 