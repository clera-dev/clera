"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { CheckCircle2, Clock, DollarSign, Shield, Mail } from 'lucide-react';
import { useAccountClosure } from '@/hooks/useAccountClosure';
import { useClosureProgress } from '@/hooks/useClosureProgress';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { clearUserSpecificLocalStorage } from '@/lib/utils/auth-storage';
import ProgressSteps from '@/components/account/ProgressSteps';
import ClosureDetails from '@/components/account/ClosureDetails';

/**
 * Dedicated Account Closure Page
 * 
 * Special Features:
 * - No sidebar navigation
 * - Dedicated closure-focused UI
 * - Process timeline and status
 * - Email notification status
 * - Clean aesthetic with lightning/tron blue accents
 */
export default function AccountClosurePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const router = useRouter();

  // Account closure data hooks
  const { closureData, loading: closureDataLoading } = useAccountClosure();
  const {
    closureSteps,
    lastUpdateStatus,
    isRetrying,
    autoRetryEnabled,
    nextRetryIn,
    hasFailed,
    isInProgress,
    handleRetryResume
  } = useClosureProgress(user?.id);  // Only call when user is loaded

  useEffect(() => {
    const checkUserStatus = async () => {
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/sign-in');
        return;
      }

      setUser(user);

      // Get user status
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('status')
        .eq('user_id', user.id)
        .single();

      const status = onboardingData?.status;
      setUserStatus(status);

      // Redirect if not in closure process
      if (status !== 'pending_closure' && status !== 'closed') {
        router.push('/dashboard');
        return;
      }

      if (status === 'closed') {
        router.push('/protected');
        return;
      }

      setLoading(false);
    };

    checkUserStatus();
  }, [router]);

  if (loading || closureDataLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (userStatus !== 'pending_closure') {
    return null; // Should have redirected above
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
        return;
      }
      
      // Clear localStorage after successful sign-out
      clearUserSpecificLocalStorage('manual-sign-out');
      
      // Redirect to home page
      router.push('/');
    } catch (err) {
      console.error("Exception during sign out:", err);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Standard Auth Header - Same as other pages */}
      <nav className="w-full flex justify-center border-b border-gray-800 h-14 sm:h-16 fixed top-0 right-0 bg-black z-50">
        <div className="w-full max-w-screen-2xl flex justify-between items-center p-3 sm:p-4 px-4 sm:px-6 lg:px-8 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            {/* Clera Logo - Non-clickable for pending_closure users */}
            <div className="font-bold">
              <img 
                src="/clera-logo.png" 
                alt="Clera" 
                className="h-8 sm:h-10 w-auto"
              />
            </div>
          </div>
          <div className="flex justify-end">
            {/* Sign Out Button */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSignOut}
              className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
            >
              Sign out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content - Add top padding for fixed header */}
      <div className="max-w-4xl mx-auto px-6 py-12 pt-20 sm:pt-24">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="relative inline-block">
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-400/20 to-blue-500/20 rounded-full blur-lg"></div>
            <div className="relative w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
              <Clock className="w-10 h-10 text-black" />
            </div>
          </div>
          
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Account Closure in Progress
          </h1>
          
          <p className="text-xl text-gray-300 mb-2">
            Your account closure process is running automatically
          </p>
          
          <p className="text-gray-400">
            You'll receive email updates throughout the 5-7 business day process
          </p>
        </div>

        {/* Closure Details Component */}
        <ClosureDetails closureData={closureData} />

        {/* Progress Steps Component */}
        <ProgressSteps
          closureSteps={closureSteps}
          lastUpdateStatus={lastUpdateStatus}
          isRetrying={isRetrying}
          autoRetryEnabled={autoRetryEnabled}
          nextRetryIn={nextRetryIn}
          hasFailed={hasFailed}
          onRetryResume={handleRetryResume}
        />

        {/* Fund Transfer Information */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <DollarSign className="w-6 h-6 mr-3 text-cyan-400" />
            Fund Transfer Process
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-white">Daily Transfer Limit</div>
                <div className="text-gray-400">
                  Alpaca limits transfers to $50,000 per day for security
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-white">Automatic Processing</div>
                <div className="text-gray-400">
                  Our system automatically handles multiple transfers with 24-hour delays
                </div>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-white">Your Connected Bank</div>
                <div className="text-gray-400">
                  Funds will be transferred to the bank account you connected during onboarding
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action */}
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-600/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2 text-cyan-400">
              No Action Required
            </h3>
            <p className="text-gray-300">
              The closure process is fully automated. You can close this page and check back later.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              You'll receive email notifications at each major milestone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}