/**
 * Secure Backend Client
 * Provides a secure abstraction layer for making authenticated requests to the backend
 * without exposing sensitive credentials to calling code
 */

import { NextRequest } from 'next/server';

export interface BackendRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

export interface BackendResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

/**
 * Secure backend client that handles authentication and request formatting
 * without exposing sensitive credentials to calling code
 */
export class BackendClient {
  private readonly backendUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    this.apiKey = process.env.BACKEND_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Server configuration error: Backend API key not available');
    }
    
    // Validate backend URL to prevent potential security issues
    if (!this.backendUrl || typeof this.backendUrl !== 'string') {
      throw new Error('Server configuration error: Invalid backend URL');
    }
  }

  /**
   * Make an authenticated request to the backend
   * @param endpoint - The API endpoint (without base URL)
   * @param options - Request options
   * @returns Promise with the response data
   */
  async request<T = any>(endpoint: string, options: BackendRequestOptions = {}): Promise<BackendResponse<T>> {
    const url = `${this.backendUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const responseText = await response.text();
      
      // Try to parse JSON response
      let responseData: any;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        // If response is not JSON, create a structured response
        responseData = { message: responseText };
      }

      return {
        success: response.ok,
        data: response.ok ? responseData : undefined,
        error: !response.ok ? responseData.error || responseData.message || `HTTP ${response.status}` : undefined,
        status: response.status,
      };
    } catch (error) {
      // Don't expose sensitive information in error messages
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      
      // Sanitize error message to prevent information leakage
      const sanitizedMessage = errorMessage.includes('API key') || 
                              errorMessage.includes('BACKEND_API') ||
                              errorMessage.includes('credentials') ||
                              errorMessage.includes('secret') ||
                              errorMessage.includes('token')
        ? 'Backend communication error'
        : errorMessage;
      
      return {
        success: false,
        error: sanitizedMessage,
        status: 500,
      };
    }
  }

  /**
   * GET request to the backend
   */
  async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  /**
   * POST request to the backend
   */
  async post<T = any>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body, headers });
  }

  /**
   * PUT request to the backend
   */
  async put<T = any>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body, headers });
  }

  /**
   * PATCH request to the backend
   */
  async patch<T = any>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers });
  }

  /**
   * DELETE request to the backend
   */
  async delete<T = any>(endpoint: string, headers?: Record<string, string>): Promise<BackendResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

/**
 * Factory function to create a backend client instance
 * This ensures the client is properly configured with environment variables
 */
export function createBackendClient(): BackendClient {
  return new BackendClient();
} 