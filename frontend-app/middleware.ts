import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@supabase/ssr";

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
  '/api/broker',
  '/api/investment',
  '/api/account',
  '/api/chat',
  '/api/conversations',
  '/api/resume-chat',
  '/api/news/portfolio-summary',
  '/api/news/watchlist',
  '/api/assets',
  '/api/user',
  '/api/ws/portfolio',
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

    console.log(`[Middleware] Processing: ${path}`);

    // Handle the homepage specifically
    if (path === '/') {
      console.log(`[Middleware] Homepage access allowed: ${path}`);
      return response;
    }

    // Check if the route is public (no auth needed)
    if (publicPaths.some(publicPath => path.startsWith(publicPath))) {
      console.log(`[Middleware] Public path allowed: ${path}`);
      return response;
    }

    // Get user authentication status
    let user = null;
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      user = authUser;
      console.log(`[Middleware] User auth status: ${user ? 'authenticated' : 'unauthenticated'}`);
    } catch (authError) {
      console.log(`[Middleware] Auth error: ${authError instanceof Error ? authError.message : 'Unknown auth error'}`);
      user = null;
    }

    // Handle auth pages (sign-in, sign-up, forgot-password)
    if (authPages.some(authPage => path.startsWith(authPage))) {
      // If user is authenticated, redirect to portfolio
      if (user) {
        console.log(`[Middleware] Authenticated user accessing auth page, redirecting to portfolio`);
        const redirectUrl = new URL('/portfolio', request.url);
        return NextResponse.redirect(redirectUrl);
      }
      // If not authenticated, allow access to auth pages
      console.log(`[Middleware] Unauthenticated user accessing auth page, allowing`);
      return response;
    }

    // For all other routes, require authentication
    if (!user) {
      console.log(`[Middleware] Unauthenticated user accessing protected route, redirecting to homepage`);
      const redirectUrl = new URL('/', request.url);
      return NextResponse.redirect(redirectUrl);
    }

    // For protected paths and API routes that require completed onboarding
    const requiresOnboarding = 
      protectedPaths.some(protectedPath => path.startsWith(protectedPath)) ||
      protectedApiPaths.some(apiPath => path.startsWith(apiPath));

    if (requiresOnboarding) {
      try {
        // Check onboarding status from the database
        const { data: onboardingData, error } = await supabase
          .from('user_onboarding')
          .select('status')
          .eq('user_id', user.id)
          .single();
        
        // Handle database errors or missing records
        if (error) {
          console.error('Onboarding status check error:', error);
          // If we can't check onboarding status, assume incomplete and redirect to onboarding
          if (path.startsWith('/api/')) {
            // For API routes, return 401 instead of redirect
            return new NextResponse(
              JSON.stringify({ error: 'Onboarding not completed' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            // For page routes, redirect to onboarding
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
        
        // Check if onboarding is complete (status is 'submitted' or 'approved')
        const hasCompletedOnboarding = 
          onboardingData?.status === 'submitted' || 
          onboardingData?.status === 'approved';
        
        // If onboarding not completed, redirect to onboarding flow or return error
        if (!hasCompletedOnboarding) {
          if (path.startsWith('/api/')) {
            // For API routes, return 401 instead of redirect
            return new NextResponse(
              JSON.stringify({ error: 'Onboarding not completed' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            // For page routes, redirect to onboarding
            const redirectUrl = new URL('/protected', request.url);
            const redirectResponse = NextResponse.redirect(redirectUrl);
            
            // Store the intended URL for after onboarding completion
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
        // If database is completely unavailable, redirect to onboarding for safety
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
    
    // For unauthenticated users trying to access protected routes, redirect to home
    if (protectedPaths.some(protectedPath => path.startsWith(protectedPath))) {
      console.log(`[Middleware] Error occurred for protected path, redirecting to homepage`);
      const redirectUrl = new URL('/', request.url);
      return NextResponse.redirect(redirectUrl);
    }
    
    // For API routes, return error
    if (protectedApiPaths.some(apiPath => path.startsWith(apiPath))) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication error' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // For other errors, allow request through but log
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
};
