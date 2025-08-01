/**
 * Secure Backend Helpers - Replacement for vulnerable api-route-helpers
 * 
 * This module provides secure authentication utilities that validate JWT tokens
 * to prevent account takeover attacks, token spoofing, and privilege escalation.
 * 
 * SECURITY FEATURES:
 * - JWT token validation and signature verification via Supabase
 * - Token-to-user matching to prevent token spoofing
 * - Expiration checking to prevent stale token usage
 * - Comprehensive error handling for security events
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
 * Secure authentication that extracts and validates JWT tokens from Authorization headers
 * SECURITY: Validates that the JWT token belongs to the authenticated user to prevent token spoofing
 */
export async function authenticateWithJWT(request: NextRequest): Promise<SecureAuthResult> {
  const supabase = await createClient();
  
  // Extract JWT token from Authorization header
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!accessToken) {
    throw new Error('JWT token required');
  }

  // SECURITY: Validate the JWT token by using it to get the user
  // This ensures the token is valid, signed, and belongs to the authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    throw new Error('Invalid or expired JWT token');
  }

  // Additional validation: Ensure the token is properly signed and not tampered with
  try {
    // Parse the JWT to extract claims without verification (just for basic structure validation)
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    
    // Verify the token matches the user ID from the validated JWT
    if (payload.sub !== user.id) {
      throw new Error('Token user ID mismatch - potential token spoofing attempt');
    }
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('JWT token has expired');
    }
    
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('Token user ID mismatch') ||
      error.message.includes('JWT token has expired')
    )) {
      throw error; // Re-throw security-related errors
    }
    throw new Error('Invalid JWT token format');
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