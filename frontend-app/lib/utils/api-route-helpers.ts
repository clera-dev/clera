/**
 * Shared utilities for API route authentication and backend configuration
 * 
 * This module provides common functionality used across multiple API routes
 * to avoid code duplication and ensure consistency.
 * 
 * Architecture: Business logic is separated from transport layer concerns.
 * Utility functions return typed results/errors, and route handlers convert
 * them to HTTP responses.
 */
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { ValidationError } from '@/utils/services/ValidationService';
import { AccountAuthorizationError } from '@/utils/services/AccountAuthorizationService';
import { ApiError } from '@/utils/services/errors';

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface BackendConfig {
  url: string;
  apiKey: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
  backendConfig: BackendConfig;
}

// Custom error classes for specific business logic failures
export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string = 'Backend service is not configured') {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Authenticates the user and validates backend configuration.
 * 
 * @returns A promise that resolves with the user and backend configuration.
 * @throws {AuthenticationError} If the user is not authenticated.
 * @throws {ConfigurationError} If the backend is not configured.
 */
export async function authenticateAndConfigureBackend(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AuthenticationError('User is not authenticated.');
  }

  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendApiKey) {
    console.error('[API Config] Backend API URL or Key is not configured.');
    throw new ConfigurationError('Backend service is not configured.');
  }

  return {
    user: { id: user.id, email: user.email },
    backendConfig: { url: backendUrl, apiKey: backendApiKey }
  };
}

/**
 * Creates standardized headers for backend API requests.
 */
export function createBackendHeaders(backendConfig: BackendConfig, userId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': backendConfig.apiKey,
    'X-User-ID': userId,
  };
}

/**
 * Converts known errors into a standard NextResponse object.
 * This function centralizes error handling for API routes.
 */
export function convertErrorToResponse(error: any, path: string): NextResponse {
  console.error(`[API Route Error] Path: ${path}, Type: ${error.constructor.name}, Message: ${error.message}`);

  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof AccountAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ConfigurationError) {
    return NextResponse.json({ error: 'Service is currently unavailable.' }, { status: 503 });
  }

  // Fallback for unexpected errors
  return NextResponse.json({ error: 'An unexpected internal server error occurred.' }, { status: 500 });
}
