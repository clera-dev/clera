import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { BackendClient, createBackendClient } from './backend-client';

export interface AuthResult {
  user: any;
  accountId: string;
  backendClient: BackendClient;
}

/**
 * Shared helper function to handle authentication, authorization, and environment setup
 * This eliminates code duplication across API route handlers
 * 
 * Returns a secure backend client instead of exposing sensitive credentials
 */
export async function authenticateAndAuthorize(
  request: NextRequest,
  params: Promise<{ accountId: string }>
): Promise<AuthResult> {
  const { accountId } = await params;
  
  // Create secure backend client (handles environment variables internally)
  const backendClient = createBackendClient();
  
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
    backendClient
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