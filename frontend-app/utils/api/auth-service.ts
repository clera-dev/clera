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
   * Authenticate and authorize a user for a specific account
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
    
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      throw new AuthError('Unauthorized', 401);
    }

    // Extract the authentication token from the request
    const authHeader = request.headers.get('authorization');
    const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!authToken) {
      throw new AuthError('Authentication token required', 401);
    }

    // Verify user owns this account
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
      authToken
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