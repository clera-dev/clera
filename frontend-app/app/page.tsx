import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Hero from "@/components/hero";
// Remove unused imports if any
// import ConnectSupabaseSteps from "@/components/tutorial/connect-supabase-steps";
// import SignUpUserSteps from "@/components/tutorial/sign-up-user-steps";
// import { hasEnvVars } from "@/utils/supabase/check-env-vars";

// This ensures Next.js knows this page should not be statically rendered
export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    // Await the client creation
    const supabase = await createClient();

    // Now getUser can be called - wrap in try/catch to handle auth errors
    try {
      const { data } = await supabase.auth.getUser();
      
      // Redirect if user is successfully fetched
      if (data?.user) {
        // Check onboarding status
        const { data: onboardingData } = await supabase
          .from('user_onboarding')
          .select('status')
          .eq('user_id', data.user.id)
          .single();
        
        const hasCompletedOnboarding = 
          onboardingData?.status === 'submitted' || 
          onboardingData?.status === 'approved';
        
        if (hasCompletedOnboarding) {
          // Check if user has funded their account (has transfers)
          const { data: transfers } = await supabase
            .from('user_transfers')
            .select('id')
            .eq('user_id', data.user.id)
            .limit(1);
          
          // If they have completed onboarding and have funded their account, go to portfolio
          if (transfers && transfers.length > 0) {
            return redirect("/portfolio");
          }
        }
        
        // Default: go to dashboard for users who haven't completed onboarding or funding
        return redirect("/dashboard");
      }
    } catch (authError) {
      // Auth error when getting user - just show the hero page
      console.log("Auth error:", authError);
      // Continue to render Hero component
    }
  } catch (error) {
    // Error creating Supabase client - just show the hero page
    console.log("Error initializing Supabase client:", error);
    // Continue to render Hero component
  }

  // Render the Hero component for unauthenticated users
  return (
    <>
      <Hero />
    </>
  );
}
