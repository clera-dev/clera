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

export default function ProtectedPageClient() {
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [onboardingData, setOnboardingData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
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
      }
      
      setLoading(false);
    };

    fetchData();
  }, [router]);

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

  return (
    <div className="flex-1 w-full flex flex-col gap-4 p-2 sm:p-4">
      <div className="w-full">
        <h1 className="text-3xl font-bold mb-4">
          {profile?.first_name ? `Welcome to Clera` : 'Welcome to Clera'}
        </h1>
        
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center mb-4">
          <InfoIcon size={16} strokeWidth={2} />
          Congrats! Your account is now ready for trading. Please fund your account below to start trading.
        </div>
      </div>
      
      <div className="flex flex-col gap-2 items-start mt-4">
        <h2 className="font-bold text-xl mb-4">Fund your account</h2>
        <p className="mb-4">Let's get your account funded to start trading.</p>
        <ManualBankEntry 
          userName={`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()}
          alpacaAccountId={onboardingData?.alpaca_account_id}
        />
      </div>
    </div>
  );
}
