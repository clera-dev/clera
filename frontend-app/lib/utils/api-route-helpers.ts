/**
 * Shared utilities for API route authentication and backend configuration
 * 
 * This module provides common functionality used across multiple API routes
 * to avoid code duplication and ensure consistency.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

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

/**
 * Authenticates the user using Supabase and validates backend configuration.
 * 
 * This function consolidates the common authentication and configuration logic
 * used across multiple API routes to ensure consistency and maintainability.
 * 
 * @returns Promise<AuthResult> - User and backend configuration
 * @throws NextResponse with appropriate error if authentication or configuration fails
 */
export async function authenticateAndConfigureBackend(): Promise<AuthResult> {
  // 1. Authenticate user
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  // 2. Validate backend configuration
  const backendUrl = process.env.BACKEND_API_URL;
  const backendApiKey = process.env.BACKEND_API_KEY;

  if (!backendUrl || !backendApiKey) {
    console.error('[API Proxy] Backend API URL or Key is not configured.');
    throw NextResponse.json({ error: 'Backend service is not configured.' }, { status: 500 });
  }

  return {
    user: {
      id: user.id,
      email: user.email
    },
    backendConfig: {
      url: backendUrl,
      apiKey: backendApiKey
    }
  };
}

/**
 * Creates standardized headers for backend API requests.
 * 
 * @param backendConfig - Backend configuration object
 * @param userId - User ID for X-User-ID header
 * @returns HeadersInit object with standard headers
 */
export function createBackendHeaders(backendConfig: BackendConfig, userId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': backendConfig.apiKey,
    'X-User-ID': userId,
  };
}

/**
 * Handles common API route errors with consistent error responses.
 * 
 * @param error - The error that occurred
 * @param path - The request path for logging
 * @returns NextResponse with appropriate error message and status
 */
export function handleApiError(error: any, path: string): NextResponse {
  // If it's already a NextResponse (thrown from authenticateAndConfigureBackend), return as-is
  if (error instanceof NextResponse) {
    return error;
  }

  console.error(`[API Route Error] ${error.message}`, { path });
  return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
} 