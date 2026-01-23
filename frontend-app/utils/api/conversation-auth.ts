import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { type AuthUser } from '@supabase/supabase-js';

/**
 * Authentication context for conversation endpoints
 * accountId is optional to support aggregation-only (SnapTrade/Plaid) users
 */
export interface ConversationAuthContext {
  user: AuthUser;
  accountId: string | null;
  supabase: any;
}

/**
 * Authentication result with success/error state
 */
export interface ConversationAuthResult {
  success: boolean;
  context?: ConversationAuthContext;
  error?: NextResponse;
}

/**
 * Centralized authentication and authorization service for conversation API routes
 * 
 * This service consolidates the authentication logic that was previously duplicated
 * across all conversation endpoints, ensuring consistency and easier maintenance.
 * 
 * SECURITY: This service performs both authentication (user identity) and 
 * authorization (account ownership) in a single operation.
 */
export class ConversationAuthService {
  
  /**
   * Authenticate user and authorize account access for conversation endpoints
   * 
   * HYBRID MODE SUPPORT: Supports SnapTrade, Plaid, and Alpaca users
   * - SnapTrade users: accountId is null, uses aggregated portfolio data
   * - Plaid users: accountId is null, uses aggregated portfolio data
   * - Alpaca users: accountId can be validated against Alpaca account
   * 
   * @param request - The incoming request
   * @param accountId - The account ID to authorize (optional - not required for SnapTrade/Plaid users)
   * @returns Authentication result with context or error response
   */
  static async authenticateAndAuthorize(
    request: NextRequest,
    accountId: string | null
  ): Promise<ConversationAuthResult> {
    try {
      // Create supabase server client for authentication
      const supabase = await createClient();
      
      // Verify user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        return {
          success: false,
          error: NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        };
      }

      // Check user's onboarding status to determine mode
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id, plaid_connection_completed_at')
        .eq('user_id', user.id)
        .single();

      if (onboardingError) {
        console.error('Database error during account authorization:', onboardingError);
        return {
          success: false,
          error: NextResponse.json(
            { error: 'Database error during authorization' },
            { status: 500 }
          )
        };
      }

      const hasAlpaca = !!onboardingData?.alpaca_account_id;
      const hasPlaid = !!onboardingData?.plaid_connection_completed_at;
      
      // Check for SnapTrade connections
      let hasSnaptrade = false;
      try {
        const { data: snaptradeAccounts, error: snaptradeError } = await supabase
          .from('snaptrade_brokerage_connections')
          .select('authorization_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1);
        
        hasSnaptrade = !snaptradeError && snaptradeAccounts && snaptradeAccounts.length > 0;
      } catch (err) {
        // SnapTrade check failed, continue with other methods
        console.log('SnapTrade connection check failed, continuing...');
      }

      // If accountId is provided, validate it matches the user's Alpaca account
      if (accountId) {
        if (!hasAlpaca) {
          return {
            success: false,
            error: NextResponse.json(
              { error: 'Brokerage account not found for this user' },
              { status: 404 }
            )
          };
        }

        if (onboardingData.alpaca_account_id !== accountId) {
          return {
            success: false,
            error: NextResponse.json(
              { error: 'Forbidden - Account access denied' },
              { status: 403 }
            )
          };
        }
      } else {
        // No accountId provided - this is OK for aggregation-only users (SnapTrade/Plaid)
        // PRODUCTION FIX: Also allow users who completed onboarding but skipped brokerage connection
        // These users should be able to use chat for exploring/asking questions
        // The chat will simply have limited functionality (no trading, no portfolio data)
        if (!hasSnaptrade && !hasPlaid && !hasAlpaca) {
          // Instead of returning 404, allow the user to proceed with null accountId
          // The conversation will work but won't have access to portfolio-specific features
          console.log('[ConversationAuth] User has no connected accounts - allowing limited chat access');
        }
      }

      // Return successful authentication context
      // accountId will be the validated Alpaca ID or null for aggregation-only users
      return {
        success: true,
        context: {
          user,
          accountId: accountId || (hasAlpaca ? onboardingData.alpaca_account_id : null),
          supabase
        }
      };

    } catch (error: any) {
      console.error('Error during conversation authentication:', error);
      return {
        success: false,
        error: NextResponse.json(
          { error: 'Internal authentication error' },
          { status: 500 }
        )
      };
    }
  }

  /**
   * Authenticate user without account-specific authorization
   * 
   * Used for endpoints that need user authentication but don't require 
   * account ownership validation (e.g., thread ownership validation)
   * 
   * @param request - The incoming request
   * @returns Authentication result with user context or error response
   */
  static async authenticateUser(request: NextRequest): Promise<{
    success: boolean;
    user?: any;
    supabase?: any;
    error?: NextResponse;
  }> {
    try {
      // Create supabase server client for authentication
      const supabase = await createClient();
      
      // Verify user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        return {
          success: false,
          error: NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          )
        };
      }

      return {
        success: true,
        user,
        supabase
      };

    } catch (error: any) {
      console.error('Error during user authentication:', error);
      return {
        success: false,
        error: NextResponse.json(
          { error: 'Internal authentication error' },
          { status: 500 }
        )
      };
    }
  }

  /**
   * Create standardized error response for authentication failures
   * 
   * @param message - Error message
   * @param status - HTTP status code
   * @returns NextResponse with error
   */
  static createErrorResponse(message: string, status: number): NextResponse {
    return NextResponse.json(
      { error: message },
      { status }
    );
  }

  /**
   * Extract account ID from request body with validation
   * 
   * @param body - Parsed request body
   * @param fieldName - Name of the field containing account ID (default: 'account_id')
   * @returns Account ID or null if not found/invalid
   */
  static extractAccountId(body: any, fieldName: string = 'account_id'): string | null {
    const accountId = body?.[fieldName];
    
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) {
      return null;
    }
    
    return accountId.trim();
  }

  /**
   * Extract account ID from query parameters with validation
   * 
   * @param url - Request URL object
   * @param paramName - Name of the query parameter (default: 'account_id')
   * @returns Account ID or null if not found/invalid
   */
  static extractAccountIdFromQuery(url: URL, paramName: string = 'account_id'): string | null {
    const accountId = url.searchParams.get(paramName);
    
    if (!accountId || accountId.trim().length === 0) {
      return null;
    }
    
    return accountId.trim();
  }
} 