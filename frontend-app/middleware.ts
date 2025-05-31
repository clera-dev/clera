import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@supabase/ssr";

// Paths that are always accessible regardless of auth state
const publicPaths = ['/', '/sign-in', '/sign-up', '/auth/callback', '/auth/confirm', '/protected/reset-password'];

// Paths that are accessible only after onboarding is complete
const protectedPostOnboardingPaths = [
  '/dashboard',
  '/invest',
  '/chat',
  '/news',
  '/info',
  '/settings'
];

// Paths that require both completed onboarding AND funding
const fundingRequiredPaths = [
  '/portfolio'
];

export async function middleware(request: NextRequest) {
  try {
    // Create a response object
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Create supabase client with the non-deprecated pattern
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Get current path
    const path = request.nextUrl.pathname;

    // Check if the route is public (no auth needed)
    if (publicPaths.some(publicPath => path.startsWith(publicPath))) {
      return response;
    }

    // Get user - Note: In server-side middleware, getUser is actually appropriate
    // but we're adding explicit context to prevent confusion with client-side usage
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If no session, redirect to sign in
    if (!user) {
      const redirectUrl = new URL('/sign-in', request.url);
      return NextResponse.redirect(redirectUrl);
    }

    // For protected paths that require completed onboarding
    if (protectedPostOnboardingPaths.some(protectedPath => path.startsWith(protectedPath))) {
      // Check onboarding status from the database
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('status')
        .eq('user_id', user.id)
        .single();
      
      // Check if onboarding is complete (status is 'submitted' or 'approved')
      const hasCompletedOnboarding = 
        onboardingData?.status === 'submitted' || 
        onboardingData?.status === 'approved';
      
      // If still in progress or not started, redirect to the onboarding flow
      if (!hasCompletedOnboarding) {
        // Redirect to protected page to continue onboarding
        const redirectUrl = new URL('/protected', request.url);
        const redirectResponse = NextResponse.redirect(redirectUrl);
        
        // Store the intended URL in a cookie for later (after onboarding completion)
        redirectResponse.cookies.set('intended_redirect', path, {
          maxAge: 3600,
          path: '/',
          sameSite: 'strict'
        });
        
        return redirectResponse;
      }
    }

    // For funding required paths
    if (fundingRequiredPaths.some(fundingPath => path.startsWith(fundingPath))) {
      // First check if onboarding is complete
      const { data: onboardingData } = await supabase
        .from('user_onboarding')
        .select('status')
        .eq('user_id', user.id)
        .single();
      
      const hasCompletedOnboarding = 
        onboardingData?.status === 'submitted' || 
        onboardingData?.status === 'approved';
      
      if (!hasCompletedOnboarding) {
        // Redirect to protected page to complete onboarding first
        const redirectUrl = new URL('/protected', request.url);
        const redirectResponse = NextResponse.redirect(redirectUrl);
        
        redirectResponse.cookies.set('intended_redirect', path, {
          maxAge: 3600,
          path: '/',
          sameSite: 'strict'
        });
        
        return redirectResponse;
      }
      
      // Check if user has funded their account (has transfers)
      const { data: transfers } = await supabase
        .from('user_transfers')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      // If they haven't funded their account, redirect to protected page for funding
      if (!transfers || transfers.length === 0) {
        const redirectUrl = new URL('/protected', request.url);
        const redirectResponse = NextResponse.redirect(redirectUrl);
        
        redirectResponse.cookies.set('intended_redirect', path, {
          maxAge: 3600,
          path: '/',
          sameSite: 'strict'
        });
        
        return redirectResponse;
      }
    }

    return response;

  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
