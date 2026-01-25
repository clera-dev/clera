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
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  console.log("Auth callback received - URL:", request.url);
  console.log("Auth code present:", !!code);
  console.log("Redirect to:", redirectTo);

  // Handle OAuth errors (e.g., user cancelled, access denied)
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    // Redirect to sign-in page with error message
    const errorMessage = errorDescription || error || "Authentication failed";
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(errorMessage)}`, requestUrl.origin)
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) {
      console.error("Code exchange error:", exchangeError);
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent("Failed to complete authentication. Please try again.")}`, requestUrl.origin)
      );
    }
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
