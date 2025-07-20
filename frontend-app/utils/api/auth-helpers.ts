import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export interface AuthResult {
  user: any;
  accountId: string;
  backendUrl: string;
  apiKey: string;
}

/**
 * Shared helper function to handle authentication, authorization, and environment setup
 * This eliminates code duplication across API route handlers
 */
export async function authenticateAndAuthorize(
  request: NextRequest,
  params: Promise<{ accountId: string }>
): Promise<AuthResult> {
  const { accountId } = await params;
  
  // Environment variables setup
  const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
  const apiKey = process.env.BACKEND_API_KEY || '';
  
  if (!apiKey) {
    throw new Error('Server configuration error: API key not available');
  }
  
  // Create supabase server client
  const supabase = await createClient();
  
  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify user owns this account
  const { data: onboardingData, error: onboardingError } = await supabase
    .from('user_onboarding')
    .select('alpaca_account_id')
    .eq('user_id', user.id)
    .single();

  if (onboardingError || !onboardingData?.alpaca_account_id) {
    throw new Error('Account not found');
  }

  if (onboardingData.alpaca_account_id !== accountId) {
    throw new Error('Unauthorized access to account');
  }

  return {
    user,
    accountId,
    backendUrl,
    apiKey
  };
}

/**
 * Helper function to create backend API headers
 */
export function createBackendHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey
  };
}

/**
 * Helper function to handle common error responses from authentication/authorization
 */
export function handleAuthError(error: unknown): { error: string; status: number } {
  if (error instanceof Error) {
    if (error.message.includes('Unauthorized')) {
      return { error: 'Unauthorized', status: 401 };
    }
    if (error.message.includes('Account not found')) {
      return { error: 'Account not found', status: 404 };
    }
    if (error.message.includes('Unauthorized access to account')) {
      return { error: 'Unauthorized access to account', status: 403 };
    }
    if (error.message.includes('Server configuration error')) {
      return { error: error.message, status: 500 };
    }
  }
  
  return { error: 'Internal server error', status: 500 };
} 