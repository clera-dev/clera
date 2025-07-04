import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { getOnboardingDataAction } from "@/app/actions";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccountInfoCard from "@/components/dashboard/AccountInfoCard";
import TransfersCard from "@/components/dashboard/TransfersCard";
import ManualBankEntry from "@/components/funding/ManualBankEntry";
import OnboardingStatusSetter from "@/components/onboarding/OnboardingStatusSetter";
import AccountClosurePending from "@/components/account/AccountClosurePending";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // Check if user has already completed onboarding
  const { data: onboardingData } = await getOnboardingDataAction(user.id);
  const userStatus = onboardingData?.status;
  const hasCompletedOnboarding = userStatus === 'submitted' || userStatus === 'approved';
  
  // Handle account closure statuses
  if (userStatus === 'pending_closure') {
    // Show account closure pending page with NO sidebar access
    return <AccountClosurePending userId={user.id} />;
  }
  
  if (userStatus === 'closed') {
    // Allow user to restart onboarding process
    return (
      <div className="flex-1 w-full flex flex-col p-2 sm:p-4 min-h-screen">
        <OnboardingStatusSetter status="not_started" />
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
  
  // Get user profile data
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single();
  
  // Get user transfers to check if account is funded
  const { data: transfers } = await supabase
    .from('user_transfers')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  
  // If not in onboarding, show the onboarding flow
  if (!hasCompletedOnboarding) {
    return (
      <div className="flex-1 w-full flex flex-col p-2 sm:p-4 min-h-screen">
        <OnboardingStatusSetter status={onboardingData?.status || 'incomplete'} />
        <div className="flex-grow pb-16">
          <OnboardingFlow 
            userId={user.id} 
            initialData={onboardingData?.onboarding_data}
          />
        </div>
      </div>
    );
  }

  // If onboarding is complete but account not funded, show funding page
  return (
    <div className="flex-1 w-full flex flex-col gap-4 p-2 sm:p-4">
      <OnboardingStatusSetter status={onboardingData?.status || 'incomplete'} />
      <div className="w-full">
        <h1 className="text-3xl font-bold mb-4">
          {profile?.first_name ? `Welcome to Clera` : 'Welcome to Clera'}
        </h1>
        
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center mb-4">
          <InfoIcon size={16} strokeWidth={2} />
          Congrats! Your account is now ready for trading. Please fund your account below to start trading.
        </div>
      </div>
      
      {/* Fund your account section */}
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
