import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const redirectTo = requestUrl.searchParams.get("redirect_to")?.toString();

  console.log("Auth callback received - URL:", request.url);
  console.log("Auth code present:", !!code);
  console.log("Origin:", origin);
  console.log("Redirect to:", redirectTo);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  if (redirectTo) {
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // Check user's onboarding and funding status to determine redirect
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // Check onboarding status
    const { data: onboardingData } = await supabase
      .from('user_onboarding')
      .select('status')
      .eq('user_id', user.id)
      .single();
    
    const hasCompletedOnboarding = 
      onboardingData?.status === 'submitted' || 
      onboardingData?.status === 'approved';
    
    if (hasCompletedOnboarding) {
      // Check if user has funded their account (has transfers)
      const { data: transfers } = await supabase
        .from('user_transfers')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      // If they have completed onboarding and have funded their account, go to portfolio
      if (transfers && transfers.length > 0) {
        return NextResponse.redirect(`${origin}/portfolio`);
      }
    }
  }

  // Default: URL to redirect to after sign up process completes
  return NextResponse.redirect(`${origin}/protected`);
}
