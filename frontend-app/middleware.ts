import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@supabase/ssr";
import { 
  getRouteConfig, 
  isPublicPath, 
  isAuthPage, 
  getOnboardingStatus, 
  hasCompletedOnboarding,
  getFundingStatus,
  hasCompletedFunding,
  isPendingClosure,
  isAccountClosed,
  shouldRestartOnboarding
} from './utils/auth/middleware-helpers';

// Paths that are always accessible regardless of auth state
const publicPaths = [
  '/auth/callback', 
  '/auth/confirm', 
  '/protected/reset-password', 
  '/ingest',
  '/.well-known'
];

// Auth pages that authenticated users should not access
const authPages = ['/sign-in', '/sign-up', '/forgot-password'];

// Paths that require authentication AND completed onboarding
const protectedPaths = [
  '/dashboard',
  '/portfolio',
  '/invest',
  '/chat',
  '/news',
  '/settings',
  '/notes',
];

// API routes that require completed onboarding
const protectedApiPaths = [
  '/api/portfolio',
  '/api/broker/account-info',
  '/api/broker/account-summary',
  '/api/broker/connect-bank',
  '/api/broker/process-plaid-token',
  '/api/broker/transfer',
  '/api/broker/bank-status',
  '/api/account',
  '/api/chat',
  '/api/conversations',
  '/api/resume-chat',
  '/api/news/portfolio-summary',
  '/api/news/watchlist',
  '/api/assets',
  '/api/user',
  '/api/ws/portfolio',
  '/api/watchlist',
];

// API routes that require authentication but not necessarily completed onboarding
const authRequiredApiPaths = [
  '/api/investment',
  '/api/companies/profiles',
  '/api/fmp',
  '/api/broker/create-account',
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  try {
    // Create a response object
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Create supabase client
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

    // Get user authentication status first for homepage handling
    let user = null;
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      user = authUser;
    } catch (authError) {
      // Auth errors handled silently in production
      user = null;
    }

    // Handle the homepage specifically
    if (path === '/') {
      if (user) {
        const redirectUrl = new URL('/portfolio', request.url);
        return NextResponse.redirect(redirectUrl);
      }
      return response;
    }

    // =================================================================
    // CRITICAL: Handle account closure statuses FIRST
    // =================================================================
    if (user) {
      try {
        const onboardingStatus = await getOnboardingStatus(supabase, user.id);
        
        // Handle pending closure status - BLOCK ALL NAVIGATION except sign-out and account closure APIs
        if (isPendingClosure(onboardingStatus)) {
          console.log(`[Middleware] User ${user.id} has pending closure status`);
          
          // Allow sign-out action
          if (path === '/auth/signout' || path.startsWith('/api/auth/signout')) {
            console.log(`[Middleware] Allowing sign-out for pending closure user`);
            return response;
          }
          
          // Allow account closure API calls (needed for progress updates)
          if (path.startsWith('/api/account-closure/')) {
            console.log(`[Middleware] Allowing account closure API call: ${path}`);
            return response;
          }
          
          // Allow PostHog ingest calls (analytics)
          if (path.startsWith('/ingest/')) {
            console.log(`[Middleware] Allowing PostHog ingest call: ${path}`);
            return response;
          }
          
          // Redirect everything else to /protected (which shows the closure pending page)
          if (path !== '/protected') {
            console.log(`[Middleware] Redirecting pending closure user from ${path} to /protected`);
            const redirectUrl = new URL('/protected', request.url);
            return NextResponse.redirect(redirectUrl);
          }
          
          // Stay on /protected to show closure pending page
          console.log(`[Middleware] Allowing access to /protected for pending closure user`);
          return response;
        }
        
        // Handle closed account status - allow restart onboarding on /protected only
        if (isAccountClosed(onboardingStatus)) {
          console.log(`[Middleware] User ${user.id} has closed account status`);
          
          // Allow sign-out
          if (path === '/auth/signout' || path.startsWith('/api/auth/signout')) {
            return response;
          }
          
          // Only allow /protected for restarting onboarding
          if (path !== '/protected') {
            console.log(`[Middleware] Redirecting closed account user to /protected for onboarding restart`);
            const redirectUrl = new URL('/protected', request.url);
            return NextResponse.redirect(redirectUrl);
          }
          
          console.log(`[Middleware] Allowing access to /protected for closed account restart`);
          return response;
        }
      } catch (dbError) {
        console.error('Database error checking account closure status:', dbError);
        // Continue to normal processing if there's an error
      }
    }

    // Handle /protected page specifically - redirect funded users to portfolio
    if (path === '/protected' && user) {
      console.log(`[Middleware] Processing /protected page for user ${user.id}`);
      try {
        const onboardingStatus = await getOnboardingStatus(supabase, user.id);
        console.log(`[Middleware] Onboarding status for user ${user.id}: ${onboardingStatus}`);
        
        if (hasCompletedOnboarding(onboardingStatus)) {
          console.log(`[Middleware] User ${user.id} has completed onboarding, checking funding status`);
          const fundingStatus = await getFundingStatus(supabase, user.id);
          console.log(`[Middleware] Funding status for user ${user.id}: ${fundingStatus}`);
          
          if (hasCompletedFunding(fundingStatus)) {
            console.log(`[Middleware] User ${user.id} has completed funding, redirecting to portfolio`);
            const redirectUrl = new URL('/portfolio', request.url);
            return NextResponse.redirect(redirectUrl);
          } else {
            console.log(`[Middleware] User ${user.id} has not completed funding, staying on /protected`);
          }
        } else {
          console.log(`[Middleware] User ${user.id} has not completed onboarding, staying on /protected`);
        }
      } catch (dbError) {
        console.error('Database error checking funding status for /protected redirect:', dbError);
        // Continue to normal processing if there's an error
      }
    }

    // Check if the route is public (no auth needed)
    if (publicPaths.some(publicPath => path.startsWith(publicPath))) {
          return response;
    }

    // Handle auth pages (sign-in, sign-up, forgot-password)
    if (isAuthPage(path)) {
      if (user) {
        const redirectUrl = new URL('/portfolio', request.url);
        return NextResponse.redirect(redirectUrl);
      }
      return response;
    }

    // Get route configuration
    const routeConfig = getRouteConfig(path);
    
    // If no specific route config, use default: require auth but not onboarding
    const config = routeConfig || { 
      requiresAuth: true, 
      requiresOnboarding: false, 
      requiresFunding: false,
      requiredRole: "user"
    };
    
    // Check authentication requirement
    if (config.requiresAuth && !user) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check onboarding requirement
    if (config.requiresOnboarding && user) {
      try {
        const onboardingStatus = await getOnboardingStatus(supabase, user.id);
        
        if (!hasCompletedOnboarding(onboardingStatus)) {
          console.log(`[Middleware] User ${user.id} has not completed onboarding (status: ${onboardingStatus})`);
          
          if (path.startsWith('/api/')) {
            return new NextResponse(
              JSON.stringify({ error: 'Onboarding not completed' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
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
      } catch (dbError) {
        console.error('Database connection error in middleware:', dbError);
        if (path.startsWith('/api/')) {
          return new NextResponse(
            JSON.stringify({ error: 'Service temporarily unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          const redirectUrl = new URL('/protected', request.url);
          return NextResponse.redirect(redirectUrl);
        }
      }
    }

    // Check funding requirement
    if (config.requiresFunding && user) {
      try {
        const onboardingStatus = await getOnboardingStatus(supabase, user.id);
        
        // Only check funding if onboarding is complete
        if (hasCompletedOnboarding(onboardingStatus)) {
          const fundingStatus = await getFundingStatus(supabase, user.id);
          
          if (!hasCompletedFunding(fundingStatus)) {
            console.log(`[Middleware] User ${user.id} has not funded their account`);
            
            if (path.startsWith('/api/')) {
              return new NextResponse(
                JSON.stringify({ error: 'Account funding required' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
              );
            } else {
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
        }
      } catch (dbError) {
        console.error('Database connection error checking funding in middleware:', dbError);
        if (path.startsWith('/api/')) {
          return new NextResponse(
            JSON.stringify({ error: 'Service temporarily unavailable' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          const redirectUrl = new URL('/protected', request.url);
          return NextResponse.redirect(redirectUrl);
        }
      }
    }

    console.log(`[Middleware] Allowing access to: ${path}`);
    return response;

  } catch (error) {
    console.error('Middleware error for path:', path, error);
    
    // Fallback error handling
    if (path.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication error' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // For page routes with errors, redirect to home
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
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
};
