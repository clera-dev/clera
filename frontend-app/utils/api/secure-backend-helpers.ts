/**
 * Secure Backend Helpers - Replacement for vulnerable api-route-helpers
 * 
 * This module provides secure authentication utilities that use JWT tokens
 * instead of client-supplied user IDs to prevent account takeover attacks.
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export interface SecureAuthResult {
  user: any;
  accessToken: string;
}

export interface BackendConfig {
  url: string;
  apiKey: string;
}

/**
 * Secure authentication that extracts JWT tokens from Authorization headers
 * SECURITY: Never trusts client-supplied user IDs, only cryptographically signed tokens
 */
export async function authenticateWithJWT(request: NextRequest): Promise<SecureAuthResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Authentication failed');
  }

  // Extract JWT token from Authorization header
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!accessToken) {
    throw new Error('JWT token required');
  }

  return {
    user,
    accessToken
  };
}

/**
 * Creates secure headers using JWT tokens for user authentication
 * SECURITY: Uses cryptographically signed JWT tokens instead of user ID headers
 */
export async function createSecureBackendHeaders(accessToken: string): Promise<HeadersInit> {
  const backendApiKey = process.env.BACKEND_API_KEY;
  
  if (!backendApiKey) {
    throw new Error('Backend API key not configured');
  }
  
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': backendApiKey,
    'Authorization': `Bearer ${accessToken}`,
  };
}

/**
 * Get backend configuration from environment variables
 */
export function getBackendConfig(): BackendConfig {
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendApiKey) {
    throw new Error('Backend service not configured');
  }

  return {
    url: backendUrl,
    apiKey: backendApiKey
  };
}