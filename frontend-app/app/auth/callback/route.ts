import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { validateAndSanitizeRedirectUrl } from "@/utils/security";
import { getRedirectPathWithServerTransferLookup } from "@/lib/utils/userRouting";

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectTo = requestUrl.searchParams.get("redirect_to")?.toString();

  console.log("Auth callback received - URL:", request.url);
  console.log("Auth code present:", !!code);
  console.log("Redirect to:", redirectTo);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  if (redirectTo) {
    // SECURITY FIX: Validate redirect URL to prevent open redirect attacks
    const safeRedirectUrl = validateAndSanitizeRedirectUrl(redirectTo);
    return NextResponse.redirect(new URL(safeRedirectUrl, requestUrl.origin));
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
    
    const userStatus = onboardingData?.status;
    
    // ARCHITECTURAL FIX: Use centralized routing logic with proper server-side transfer lookup
    // This eliminates duplicate Supabase queries and maintains proper client/server separation
    const redirectPath = await getRedirectPathWithServerTransferLookup(userStatus, user.id, supabase);
    return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
  }

  // Default: URL to redirect to after sign up process completes
  return NextResponse.redirect(new URL('/protected', requestUrl.origin));
}
