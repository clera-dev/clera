/**
 * Backend Service
 * Handles backend API communication only
 * Follows single responsibility principle
 */

import { BackendClient, createBackendClient } from '@/lib/server/backend-client';

export interface BackendServiceConfig {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  authToken?: string;
}

export interface BackendServiceError {
  message: string;
  status: number;
  details?: any;
}

/**
 * Backend service that handles only backend communication
 * Does not deal with authentication or authorization
 */
export class BackendService {
  private client: BackendClient;

  constructor() {
    this.client = createBackendClient();
  }

  /**
   * Make a request to the backend API
   * @param config - The request configuration
   * @returns The response data
   * @throws BackendServiceError if the request fails
   */
  async request<T = any>(config: BackendServiceConfig): Promise<T> {
    const { endpoint, method = 'GET', body, authToken } = config;

    // Validate endpoint to prevent potential security issues
    if (!endpoint || typeof endpoint !== 'string') {
      throw { message: 'Invalid endpoint', status: 400 };
    }

    // Ensure endpoint starts with / to prevent potential path traversal
    if (!endpoint.startsWith('/')) {
      throw { message: 'Invalid endpoint format', status: 400 };
    }

    // Prepare headers with authentication token if provided
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let response;
    switch (method) {
      case 'GET':
        response = await this.client.get<T>(endpoint, headers);
        break;
      case 'POST':
        response = await this.client.post<T>(endpoint, body, headers);
        break;
      case 'PUT':
        response = await this.client.put<T>(endpoint, body, headers);
        break;
      case 'PATCH':
        response = await this.client.patch<T>(endpoint, body, headers);
        break;
      case 'DELETE':
        response = await this.client.delete<T>(endpoint, headers);
        break;
      default:
        throw { message: 'Unsupported HTTP method', status: 400 };
    }

    if (!response.success) {
      throw {
        message: response.error || 'Backend request failed',
        status: response.status,
        details: response.data
      };
    }

    // Ensure response.data exists before returning
    if (response.data === undefined) {
      throw {
        message: 'Backend response missing data',
        status: response.status
      };
    }

    return response.data;
  }

  /**
   * Get PII data for an account
   * @param accountId - The account ID
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param authToken - The user's authentication token
   * @returns PII data
   */
  async getPII(accountId: string, userId: string, authToken?: string) {
    return this.request({
      endpoint: `/api/account/${encodeURIComponent(accountId)}/pii`,
      method: 'GET',
      authToken
    });
  }

  /**
   * Update PII data for an account
   * @param accountId - The account ID
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param updateData - The data to update
   * @param authToken - The user's authentication token
   * @returns Update result
   */
  async updatePII(accountId: string, userId: string, updateData: any, authToken?: string) {
    return this.request({
      endpoint: `/api/account/${encodeURIComponent(accountId)}/pii`,
      method: 'PATCH',
      body: updateData,
      authToken
    });
  }

  /**
   * Get updateable fields for an account
   * @param accountId - The account ID
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param authToken - The user's authentication token
   * @returns Updateable fields configuration
   */
  async getUpdateableFields(accountId: string, userId: string, authToken?: string) {
    return this.request({
      endpoint: `/api/account/${accountId}/pii/updateable-fields`,
      method: 'GET',
      authToken
    });
  }

  /**
   * Handle backend service errors and convert to appropriate HTTP responses
   * @param error - The caught error
   * @returns Formatted error response
   */
  static handleBackendError(error: unknown): BackendServiceError {
    if (error && typeof error === 'object' && 'message' in error && 'status' in error) {
      return error as BackendServiceError;
    }
    
    if (error instanceof Error) {
      return {
        message: error.message,
        status: 500
      };
    }
    
    return {
      message: 'Backend service error',
      status: 500
    };
  }
} 