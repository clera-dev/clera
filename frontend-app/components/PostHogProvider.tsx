"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { Suspense, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isAccountClosure, setIsAccountClosure] = useState(false);
  
  useEffect(() => {
    // Check if user has pending_closure status and disable PostHog if so
    const checkAccountStatus = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: onboardingData } = await supabase
            .from('user_onboarding')
            .select('status')
            .eq('user_id', user.id)
            .single();
          
          const isPendingClosure = onboardingData?.status === 'pending_closure' || 
                                   onboardingData?.status === 'closed';
          setIsAccountClosure(isPendingClosure);
          
          if (isPendingClosure) {
            console.log('[PostHog] Disabled for account closure user');
            return; // Don't initialize PostHog
          }
        }
      } catch (error) {
        console.error('[PostHog] Error checking account status:', error);
      }
      
      // Initialize PostHog only if not account closure
      if (!isAccountClosure) {
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          api_host: "/ingest",
          ui_host: "https://us.posthog.com",
          capture_pageview: false, // We capture pageviews manually
          capture_pageleave: true, // Enable pageleave capture
          capture_exceptions: true, // This enables capturing exceptions using Error Tracking, set to false if you don't want this
          enable_heatmaps: true,
          debug: process.env.NODE_ENV === "development",
        })
      }
    };
    
    checkAccountStatus();
  }, [])

  // Don't render PostHog provider for account closure users
  if (isAccountClosure) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  )
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      const search = searchParams?.toString()
      if (search) {
        url += "?" + search
      }
      posthog.capture("$pageview", { "$current_url": url })
    }
  }, [pathname, searchParams, posthog])

  return null
}

function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  )
}