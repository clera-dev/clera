"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import { getOnboardingDataAction } from '@/app/actions';
import { InfoIcon } from 'lucide-react';
import ManualBankEntry from '@/components/funding/ManualBankEntry';
import AccountClosurePending from '@/components/account/AccountClosurePending';
import { Skeleton } from '@/components/ui/skeleton';

type FundingStep = 'welcome' | 'connect-bank';



export default function ProtectedPageClient() {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [fundingStep, setFundingStep] = useState<FundingStep>('welcome');
  const [hasFunding, setHasFunding] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/sign-in');
        return;
      }
      setUser(user);

      const { data: onboarding } = await getOnboardingDataAction(user.id);
      setUserStatus(onboarding?.status || 'not_started');
      setOnboardingData(onboarding);

      if (onboarding?.status === 'submitted' || onboarding?.status === 'approved') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();
        setProfile(profileData);

        // Check funding status for completed onboarding users
        const { data: transfers } = await supabase
          .from('user_transfers')
          .select('amount, status')
          .eq('user_id', user.id)
          .gte('amount', 1);
        
        const funded = !!(transfers && transfers.length > 0 && 
          transfers.some((transfer: any) => 
            transfer.status === 'QUEUED' ||
            transfer.status === 'SUBMITTED' ||
            transfer.status === 'COMPLETED' || 
            transfer.status === 'SETTLED'
          ));
        
        setHasFunding(funded);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [router]);

  // Handle navigation when funding status changes
  useEffect(() => {
    if (!loading && hasFunding && (userStatus === 'submitted' || userStatus === 'approved')) {
      console.log('User has completed onboarding and funding, redirecting to /invest');
      router.replace('/invest');
    }
  }, [hasFunding, userStatus, loading, router]);

  if (loading) {
    return (
      <div className="flex-1 w-full flex flex-col gap-4 p-2 sm:p-4">
        <div className="w-full">
          <Skeleton className="h-10 w-1/2 mb-4" />
          <Skeleton className="h-12 w-full mb-4" />
        </div>
        <div className="flex flex-col gap-2 items-start mt-4">
          <Skeleton className="h-8 w-1/4 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-4" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }
  
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';

  if (userStatus === 'pending_closure') {
    return <AccountClosurePending userId={user.id} />;
  }
  
  if (userStatus === 'closed') {
    return (
      <div className="flex-1 w-full flex flex-col p-2 sm:p-4 min-h-screen">
        <div className="flex-grow pb-16">
          <div className="max-w-2xl mx-auto py-8">
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <h1 className="text-2xl font-bold mb-4">Welcome Back to Clera</h1>
              <p className="text-muted-foreground mb-6">
                Your previous account has been closed. You can create a new account to start trading again.
              </p>
              <OnboardingFlow 
                userId={user.id} 
                userEmail={user.email}
                initialData={undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!hasCompletedOnboarding) {
    return (
      <div className="flex-1 w-full flex flex-col">
        <div className="flex-grow pb-16">
          <OnboardingFlow 
            userId={user.id}
            userEmail={user.email} 
            initialData={onboardingData?.onboarding_data}
          />
        </div>
      </div>
    );
  }

  // If onboarding is complete but funding is not, show funding flow
  // If both are complete, user was already redirected to /invest above via useEffect

  // Welcome step - "Almost there!" page
  if (fundingStep === 'welcome') {
    return (
      <div className="flex-1 w-full flex flex-col min-h-screen">
        <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            {/* Success Message */}
            <div className="text-center">
              <div className="relative">
                <div className="absolute -top-16 -left-16 w-32 h-32 bg-primary/5 rounded-full blur-xl" />
                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-blue-500/5 rounded-full blur-lg" />
                <h1 className="text-3xl sm:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent relative">
                  Almost there{profile?.first_name ? `, ${profile.first_name}` : ''}!
                </h1>
              </div>
              
              <div className="bg-card/50 border border-border/30 rounded-xl p-6 shadow-lg backdrop-blur-sm">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-green-100 rounded-full">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg text-muted-foreground mb-2">
                  Your account is successfully set up.
                </p>
                <p className="text-base text-muted-foreground">
                  Funding your account is the last step!
                </p>
              </div>
            </div>

            {/* Bank Connection */}
            <div className="space-y-4">
              <ManualBankEntry 
                userName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
                alpacaAccountId={onboardingData?.alpaca_account_id}
                onStartConnection={() => setFundingStep('connect-bank')}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bank connection step - Full clean page for bank connection
  if (fundingStep === 'connect-bank') {
    return (
      <div className="flex-1 w-full flex flex-col min-h-screen">
        <div className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-lg w-full">
            <ManualBankEntry 
              userName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
              alpacaAccountId={onboardingData?.alpaca_account_id}
              onBack={() => setFundingStep('welcome')}
              onTransferComplete={() => {
                setHasFunding(true);
                router.replace('/invest');
              }}
              showFullForm={true}
            />
          </div>
        </div>
      </div>
    );
  }

  // This should never be reached since funded users are redirected above
  // But just in case, redirect to invest
  console.log('Unexpected state: reached end of protected page logic, redirecting to /invest');
  router.replace('/invest');
  return null;
}
