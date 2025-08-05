/**
 * Secure Backend Client - SERVER-SIDE ONLY
 * Provides a secure abstraction layer for making authenticated requests to the backend
 * without exposing sensitive credentials to calling code
 * 
 * IMPORTANT: This module is for SERVER-SIDE USE ONLY.
 * Do not import this module in client-side code as it contains sensitive credentials.
 * 
 * Location: /lib/server/ - Ensures this code cannot be bundled for the browser
 */

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
 * 
 * SERVER-SIDE ONLY: This class must only be instantiated on the server side.
 */
export class BackendClient {
  private readonly backendUrl: string;
  private readonly apiKey: string;

  constructor() {
    // Security check: Ensure this is running on the server side
    if (typeof window !== 'undefined') {
      throw new Error('BackendClient cannot be instantiated on the client side for security reasons');
    }
    
    // Additional security check: Ensure we're in a Node.js environment
    if (typeof process === 'undefined' || !process.env) {
      throw new Error('BackendClient requires a Node.js environment with process.env access');
    }
    
    this.backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    this.apiKey = process.env.BACKEND_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Server configuration error: Backend API key not available');
    }
    
    // Validate backend URL to prevent potential security issues
    if (!this.backendUrl || typeof this.backendUrl !== 'string') {
      throw new Error('Server configuration error: Invalid backend URL');
    }
    
    // Additional security: Validate API key format (should not be empty or too short)
    if (this.apiKey.length < 10) {
      throw new Error('Server configuration error: Backend API key appears to be invalid');
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
      ...(options.headers || {}),
      'X-API-Key': this.apiKey, // Always set last to prevent overwrite
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.method && options.method !== 'GET' && options.body ? JSON.stringify(options.body) : undefined,
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
                              errorMessage.includes('token') ||
                              errorMessage.includes('configuration') ||
                              errorMessage.includes('environment')
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
 * 
 * SERVER-SIDE ONLY: This function must only be called on the server side.
 */
export function createBackendClient(): BackendClient {
  // Security check: Ensure this is running on the server side
  if (typeof window !== 'undefined') {
    throw new Error('createBackendClient cannot be called on the client side for security reasons');
  }
  
  return new BackendClient();
} 