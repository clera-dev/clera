/**
 * Service for handling account ownership verification and authorization logic.
 * 
 * This service encapsulates the business logic for verifying that authenticated users
 * have access to specific accounts, maintaining security and separation of concerns.
 */

import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export interface AccountVerificationResult {
  isAuthorized: boolean;
  accountId: string;
  error?: NextResponse;
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
        console.error(`Account ownership verification failed for user ${userId}, account ${accountId}:`, onboardingError);
        
        return {
          isAuthorized: false,
          accountId,
          error: NextResponse.json(
            { error: 'Account not found or access denied' },
            { status: 403 }
          )
        };
      }
      
      console.log(`Account ownership verified successfully for user ${userId}, account ${accountId}`);
      
      return {
        isAuthorized: true,
        accountId,
      };
      
    } catch (error) {
      console.error(`Account ownership verification error for user ${userId}, account ${accountId}:`, error);
      
      return {
        isAuthorized: false,
        accountId,
        error: NextResponse.json(
          { error: 'Account verification failed' },
          { status: 500 }
        )
      };
    }
  }

  /**
   * Middleware-style verification that throws NextResponse on failure
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