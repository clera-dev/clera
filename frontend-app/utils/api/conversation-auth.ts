import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { type AuthUser } from '@supabase/supabase-js';

/**
 * Authentication context for conversation endpoints
 */
export interface ConversationAuthContext {
  user: AuthUser;
  accountId: string;
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
   * @param request - The incoming request
   * @param accountId - The account ID to authorize (from request body or params)
   * @returns Authentication result with context or error response
   */
  static async authenticateAndAuthorize(
    request: NextRequest,
    accountId: string
  ): Promise<ConversationAuthResult> {
    
    // Validate account ID parameter
    if (!accountId) {
      return {
        success: false,
        error: NextResponse.json(
          { error: 'Account ID is required' },
          { status: 400 }
        )
      };
    }

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

      // Verify user owns this account
      const { data: onboardingData, error: onboardingError } = await supabase
        .from('user_onboarding')
        .select('alpaca_account_id')
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

      if (!onboardingData?.alpaca_account_id) {
        return {
          success: false,
          error: NextResponse.json(
            { error: 'Account not found for this user' },
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

      // Return successful authentication context
      return {
        success: true,
        context: {
          user,
          accountId,
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