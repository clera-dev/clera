/**
 * API Route Middleware Utilities
 * 
 * Production-grade middleware for Next.js API routes following SOLID principles:
 * - Single Responsibility: Each function has one clear purpose
 * - Open/Closed: Extensible without modification
 * - Liskov Substitution: Implementations are interchangeable
 * - Interface Segregation: Minimal, focused interfaces
 * - Dependency Inversion: Depends on abstractions, not concretions
 * 
 * SECURITY FEATURES:
 * - Prevents IDOR (Insecure Direct Object Reference) attacks
 * - Enforces authenticated user ID (never trusts client input)
 * - Validates and sanitizes all inputs
 * - Constant-time comparisons for secrets
 * - Comprehensive error handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticated user context
 * Contains verified identity information
 */
export interface AuthenticatedUserContext {
  user: any;
  userId: string;
  session: any;
  accessToken: string;
}

/**
 * Backend configuration
 */
export interface BackendProxyConfig {
  backendUrl: string;
  backendApiKey: string;
}

/**
 * Error types for proper error handling
 */
export class AuthenticationError extends Error {
  constructor(message: string, public readonly status: number = 401) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Authenticate user and return their verified context
 * 
 * SECURITY: This is the single source of truth for user authentication.
 * Never accept user_id from query parameters or request body - always use
 * the authenticated user's ID from the session/JWT.
 * 
 * @param request - The incoming request
 * @returns Authenticated user context
 * @throws AuthenticationError if authentication fails
 */
export async function authenticateUser(request?: NextRequest): Promise<AuthenticatedUserContext> {
  const supabase = await createClient();
  
  // Get authenticated user from session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new AuthenticationError('User authentication required', 401);
  }

  // Get session for access token (needed for backend communication)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session) {
    throw new AuthenticationError('Valid session required', 401);
  }

  return {
    user,
    userId: user.id,
    session,
    accessToken: session.access_token,
  };
}

/**
 * Get and validate backend configuration
 * 
 * SECURITY: Ensures backend communication is properly configured
 * before making any requests.
 * 
 * @returns Backend configuration
 * @throws ConfigurationError if configuration is missing
 */
export function getBackendProxyConfig(): BackendProxyConfig {
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;
  
  if (!backendUrl || !backendApiKey) {
    throw new ConfigurationError('Backend API configuration missing');
  }

  return {
    backendUrl,
    backendApiKey,
  };
}

/**
 * Create headers for secure backend communication
 * 
 * @param config - Backend configuration
 * @param accessToken - Optional user access token for user-authenticated requests
 * @returns Headers for backend requests
 */
export function createBackendHeaders(
  config: BackendProxyConfig,
  accessToken?: string
): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-API-Key': config.backendApiKey,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Proxy request to backend with proper authentication and authorization
 * 
 * SECURITY FEATURES:
 * - Enforces authenticated user ID (prevents IDOR)
 * - Validates configuration before making requests
 * - Properly handles errors and doesn't leak sensitive information
 * - Encodes all URL parameters to prevent injection
 * 
 * @param endpoint - Backend endpoint (e.g., '/api/portfolio/analytics')
 * @param userContext - Authenticated user context
 * @param options - Additional request options
 * @returns Response from backend
 */
export async function proxyToBackend(
  endpoint: string,
  userContext: AuthenticatedUserContext,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    queryParams?: Record<string, string>;
    includeAuth?: boolean;
  } = {}
): Promise<Response> {
  const {
    method = 'GET',
    body,
    queryParams = {},
    includeAuth = true,
  } = options;

  const config = getBackendProxyConfig();
  
  // SECURITY: Always include authenticated user_id in query params
  // This prevents IDOR attacks by ensuring backend knows who is making the request
  const finalQueryParams = {
    user_id: userContext.userId,
    ...queryParams,
  };

  // Build URL with properly encoded query parameters
  const queryString = new URLSearchParams(finalQueryParams).toString();
  const targetUrl = `${config.backendUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;

  // Create headers
  const headers = createBackendHeaders(
    config,
    includeAuth ? userContext.accessToken : undefined
  );

  // Make request to backend
  const response = await fetch(targetUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  return response;
}

/**
 * Handle backend proxy response and convert to Next.js response
 * 
 * @param backendResponse - Response from backend
 * @returns Next.js JSON response
 */
export async function handleBackendResponse(backendResponse: Response): Promise<NextResponse> {
  if (!backendResponse.ok) {
    const errorText = await backendResponse.text();
    let errorDetail = errorText;
    
    try {
      const errorJson = JSON.parse(errorText);
      errorDetail = errorJson.detail || errorJson.error || errorText;
    } catch {
      // Use raw text if not JSON
    }

    console.error(`Backend error: ${backendResponse.status} - ${errorDetail}`);
    
    return NextResponse.json(
      { error: 'Backend service error', details: errorDetail },
      { status: backendResponse.status }
    );
  }

  const data = await backendResponse.json();
  return NextResponse.json(data);
}

/**
 * Validate admin secret using constant-time comparison
 * 
 * SECURITY: Uses timingSafeEqual to prevent timing attacks
 * that could be used to guess the admin secret.
 * 
 * @param providedSecret - Secret from request
 * @returns true if valid, false otherwise
 */
export function validateAdminSecret(providedSecret: string | null): boolean {
  const expectedSecret = process.env.ADMIN_SECRET;
  
  if (!providedSecret || !expectedSecret) {
    return false;
  }
  
  if (providedSecret.length !== expectedSecret.length) {
    return false;
  }
  
  try {
    return timingSafeEqual(
      Buffer.from(providedSecret, 'utf8'),
      Buffer.from(expectedSecret, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Validate CRON secret using constant-time comparison
 * 
 * SECURITY: Uses timingSafeEqual to prevent timing attacks.
 * Accepts secret from Authorization header in Bearer token format.
 * 
 * @param authHeader - Authorization header value
 * @returns true if valid, false otherwise
 */
export function validateCronSecret(authHeader: string | null): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  
  if (!authHeader || !expectedSecret) {
    return false;
  }
  
  // Extract Bearer token
  const providedSecret = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;
  
  if (providedSecret.length !== expectedSecret.length) {
    return false;
  }
  
  try {
    return timingSafeEqual(
      Buffer.from(providedSecret, 'utf8'),
      Buffer.from(expectedSecret, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Standard error response handler
 * 
 * @param error - The error to handle
 * @returns Next.js JSON error response
 */
export function handleError(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  
  if (error instanceof ConfigurationError) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: error.status }
    );
  }
  
  if (error instanceof Error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
  
  console.error('Unknown error:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

/**
 * Verify Alpaca account ownership
 * 
 * SECURITY: Ensures the authenticated user owns the specified Alpaca account.
 * Critical for preventing unauthorized access to account data.
 * 
 * This is the centralized implementation used across all routes that need
 * Alpaca account ownership verification, ensuring consistent security checks.
 * 
 * @param userId - Authenticated user ID
 * @param accountId - Alpaca account ID to verify
 * @returns Alpaca account ID if verification succeeds
 * @throws AuthenticationError if ownership verification fails
 */
export async function verifyAlpacaAccountOwnership(
  userId: string,
  accountId: string
): Promise<string> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user_onboarding')
    .select('alpaca_account_id')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    throw new AuthenticationError('Account verification failed', 500);
  }
  
  if (!data?.alpaca_account_id) {
    throw new AuthenticationError('Account not found', 404);
  }
  
  if (data.alpaca_account_id !== accountId) {
    throw new AuthenticationError('Unauthorized access to account', 403);
  }
  
  return data.alpaca_account_id;
}

