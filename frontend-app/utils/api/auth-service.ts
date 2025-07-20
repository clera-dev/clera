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
   * @param _request - The incoming request (unused but required for interface consistency)
   * @param accountId - The account ID from route parameters
   * @returns AuthContext with user and account information
   * @throws AuthError if authentication/authorization fails
   */
  static async authenticateAndAuthorize(
    _request: NextRequest,
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

    // Verify user owns this account
    const { data: onboardingData, error: onboardingError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .single();

    if (onboardingError || !onboardingData?.alpaca_account_id) {
      throw new AuthError('Account not found', 404);
    }

    if (onboardingData.alpaca_account_id !== accountId) {
      throw new AuthError('Unauthorized access to account', 403);
    }

    return {
      user,
      accountId
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
      if (error.message.includes('Unauthorized')) {
        return { message: 'Unauthorized', status: 401 };
      }
      if (error.message.includes('Account not found')) {
        return { message: 'Account not found', status: 404 };
      }
      if (error.message.includes('Unauthorized access to account')) {
        return { message: 'Unauthorized access to account', status: 403 };
      }
    }
    
    return { message: 'Internal server error', status: 500 };
  }
} 