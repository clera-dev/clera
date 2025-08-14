/**
 * Authentication Service
 * Handles user authentication and authorization only
 * Follows single responsibility principle
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export interface AuthContext {
  user: any;
  accountId: string;
  authToken: string;
}

export interface AuthErrorResponse {
  message: string;
  status: number;
}

/**
 * Custom error class for authentication and authorization errors
 * Extends Error to preserve stack traces and follow Error contract
 */
export class AuthError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

/**
 * Authentication service that handles only auth concerns
 * Does not deal with backend configuration or API keys
 */
export class AuthService {
  /**
   * Authenticate and authorize a user for a specific account with dual auth support
   * 
   * INDUSTRY BEST PRACTICE: Supports both authentication patterns:
   * 1. Session-based (cookies) - for client-side fetch requests from React components
   * 2. JWT-based (Authorization header) - for service-to-service calls with explicit tokens
   * 
   * @param request - The incoming request
   * @param accountId - The account ID from route parameters
   * @returns AuthContext with user and account information
   * @throws AuthError if authentication/authorization fails
   */
  static async authenticateAndAuthorize(
    request: NextRequest,
    accountId: string
  ): Promise<AuthContext> {
    // Create supabase server client
    const supabase = await createClient();
    
    let user: any = null;
    let accessToken: string | null = null;

    // PATTERN 1: Try JWT-based authentication first (Authorization header)
    // This supports service-to-service calls and explicit token passing
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const explicitToken = authHeader.substring(7);
      
      try {
        // Validate the explicit JWT token
        const { data: { user: jwtUser }, error: jwtError } = await supabase.auth.getUser(explicitToken);
        
        if (!jwtError && jwtUser) {
          user = jwtUser;
          accessToken = explicitToken;
          console.log('[Auth] Using JWT-based authentication from Authorization header');
        }
      } catch (error) {
        // JWT validation failed, fall through to session-based auth
        console.log('[Auth] JWT validation failed, falling back to session-based auth');
      }
    }

    // PATTERN 2: Fall back to session-based authentication (cookies)
    // This supports client-side fetch requests from React components
    if (!user || !accessToken) {
      try {
        // Get user from session (cookie-based)
        const {
          data: { user: sessionUser },
          error: userError
        } = await supabase.auth.getUser();
        
        if (userError || !sessionUser) {
          throw new AuthError('Unauthorized - no valid session or JWT token', 401);
        }

        // Get the access token from the session for backend communication
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();
        
        if (sessionError || !session?.access_token) {
          throw new AuthError('Authentication session required', 401);
        }

        user = sessionUser;
        accessToken = session.access_token;
        console.log('[Auth] Using session-based authentication from cookies');
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }
        throw new AuthError('Authentication failed', 401);
      }
    }

    // At this point we have a valid user and access token from either pattern
    if (!user || !accessToken) {
      throw new AuthError('Authentication failed - no user or token available', 401);
    }

    // Verify user owns this account (same logic for both auth patterns)
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError) {
      // Database/server error: propagate as 500 Internal Server Error
      throw new AuthError(
        `Database error: ${onboardingError.message || 'Unknown error'}`,
        500
      );
    }

    if (!onboardingData?.alpaca_account_id) {
      // Account not found for this user
      throw new AuthError('Account not found', 404);
    }

    if (onboardingData.alpaca_account_id !== accountId) {
      throw new AuthError('Unauthorized access to account', 403);
    }

    return {
      user,
      accountId,
      authToken: accessToken
    };
  }

  /**
   * Handle authentication errors and convert to appropriate HTTP responses
   * @param error - The caught error
   * @returns Formatted error response
   */
  static handleAuthError(error: unknown): AuthErrorResponse {
    if (error instanceof AuthError) {
      return { message: error.message, status: error.status };
    }
    
    if (error && typeof error === 'object' && 'message' in error && 'status' in error) {
      return error as AuthErrorResponse;
    }
    
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized access to account')) {
        return { message: error.message, status: 403 };
      }
      if (error.message.includes('Unauthorized')) {
        return { message: error.message, status: 401 };
      }
      if (error.message.includes('Account not found')) {
        return { message: 'Account not found', status: 404 };
      }
    }
    
    return { message: 'Internal server error', status: 500 };
  }
} 