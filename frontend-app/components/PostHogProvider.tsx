"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { Suspense, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isAccountClosure, setIsAccountClosure] = useState(false);

  // Suppress noisy AbortError rejections originating from aborted analytics requests
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      const message = String(reason?.message || '');
      const name = String(reason?.name || '');
      if (name === 'AbortError' || message.includes('signal is aborted')) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);
  const [isInitialized, setIsInitialized] = useState(false);
  
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
            setIsInitialized(true); // Mark as "initialized" (but actually disabled)
            return; // Don't initialize PostHog
          }
        }
        
        // Initialize PostHog only if not account closure
        const isProd = process.env.NODE_ENV === 'production';
        console.log('[PostHog] Initializing for regular user', { env: process.env.NODE_ENV });
        // Avoid duplicate init during Fast Refresh / re-mounts
        if ((posthog as any).__loaded) {
          setIsInitialized(true)
          return
        }
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          api_host: "/ingest",
          ui_host: "https://us.posthog.com",
          capture_pageview: false, // We capture pageviews manually
          capture_pageleave: true, // Enable pageleave capture
          // Reduce noise from dev refreshes and aborted requests being reported as exceptions
          capture_exceptions: isProd,
          // rrweb-based features can interact poorly with DevTools in development; enable only in prod
          enable_heatmaps: isProd,
          // Reduce noisy console/rrweb capture during sensitive auth/onboarding flows
          session_recording: {
            enabled: isProd,
            // Disable rrweb console recording to prevent recursive logging loops with DevTools
            recordConsole: false as any,
            recordCrossOriginIframes: false,
            captureCanvas: false,
          } as any,
          // Never enable debug logs in the browser to avoid console recursion with rrweb/DevTools
          debug: false,
        });
        setIsInitialized(true);
      } catch (error) {
        console.error('[PostHog] Error checking account status:', error);
        // On error, don't initialize PostHog for safety
        setIsAccountClosure(true);
        setIsInitialized(true);
      }
    };
    
    checkAccountStatus();
  }, [])

  // Don't render anything until we've determined the account status
  if (!isInitialized) {
    return <>{children}</>;
  }

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