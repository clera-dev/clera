import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from "@supabase/ssr";

// Paths that are always accessible regardless of auth state
const publicPaths = ['/', '/auth/callback', '/auth/confirm', '/protected/reset-password'];

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

    // Get current path
    const path = request.nextUrl.pathname;

    // Check if the route is public (no auth needed)
    if (publicPaths.some(publicPath => path.startsWith(publicPath))) {
      return response;
    }

    // Get user authentication status
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Handle auth pages (sign-in, sign-up, forgot-password)
    if (authPages.some(authPage => path.startsWith(authPage))) {
      // If user is authenticated, redirect to portfolio
      if (user) {
        const redirectUrl = new URL('/portfolio', request.url);
        return NextResponse.redirect(redirectUrl);
      }
      // If not authenticated, allow access to auth pages
      return response;
    }

    // For all other routes, require authentication
    if (!user) {
      const redirectUrl = new URL('/sign-in', request.url);
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

    return response;

  } catch (error) {
    console.error('Middleware error:', error);
    // On any other error, allow the request through but log the error
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
