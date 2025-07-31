/**
 * Service for handling account ownership verification and authorization logic.
 * 
 * This service encapsulates the business logic for verifying that authenticated users
 * have access to specific accounts, maintaining security and separation of concerns.
 * 
 * SECURITY: This service handles sensitive user and account data. All logging
 * operations are designed to avoid exposing personally identifiable information
 * (PII) or account-specific identifiers in application logs to prevent data
 * breaches and comply with data protection regulations.
 * 
 * Architecture: Business logic is separated from transport layer concerns.
 * Service functions return typed results/errors, and API routes convert
 * them to HTTP responses.
 */

import { createClient } from '@/utils/supabase/server';

// Business logic error types
export class AccountAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 403,
    public readonly accountId?: string
  ) {
    super(message);
    this.name = 'AccountAuthorizationError';
  }
}

export interface AccountVerificationResult {
  isAuthorized: boolean;
  accountId: string;
  error?: AccountAuthorizationError;
}

export class AccountAuthorizationService {
  private static instance: AccountAuthorizationService;

  private constructor() {}

  public static getInstance(): AccountAuthorizationService {
    if (!AccountAuthorizationService.instance) {
      AccountAuthorizationService.instance = new AccountAuthorizationService();
    }
    return AccountAuthorizationService.instance;
  }

  /**
   * Verify that the authenticated user owns the specified account
   * 
   * Architecture: Returns typed validation results or throws business logic errors.
   * API routes are responsible for converting errors to HTTP responses.
   */
  public async verifyAccountOwnership(
    userId: string, 
    accountId: string
  ): Promise<AccountVerificationResult> {
    try {
      const supabase = await createClient();
      
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
        .eq('user_id', userId)
        .eq('alpaca_account_id', accountId)
        .single();
      
      if (onboardingError || !onboardingData) {
        // SECURITY: Log error without exposing sensitive user/account identifiers
        console.error('Account ownership verification failed:', onboardingError);
        
        return {
          isAuthorized: false,
          accountId,
          error: new AccountAuthorizationError(
            'Account not found or access denied',
            403,
            accountId
          )
        };
      }
      
      // SECURITY: Log success without exposing sensitive user/account identifiers
      console.log('Account ownership verified successfully');
      
      return {
        isAuthorized: true,
        accountId,
      };
      
    } catch (error) {
      // SECURITY: Log error without exposing sensitive user/account identifiers
      console.error('Account ownership verification error:', error);
      
      return {
        isAuthorized: false,
        accountId,
        error: new AccountAuthorizationError(
          'Account verification failed',
          500,
          accountId
        )
      };
    }
  }

  /**
   * Middleware-style verification that throws AccountAuthorizationError on failure
   * 
   * Architecture: Throws business logic errors that API routes convert to HTTP responses.
   */
  public async requireAccountOwnership(
    userId: string, 
    accountId: string
  ): Promise<string> {
    const result = await this.verifyAccountOwnership(userId, accountId);
    
    if (!result.isAuthorized && result.error) {
      throw result.error;
    }
    
    return result.accountId;
  }
} 