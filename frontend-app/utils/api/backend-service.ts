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

export class BackendServiceError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'BackendServiceError';
    this.status = status;
    this.details = details;
    // Set the prototype explicitly for ES5 targets
    Object.setPrototypeOf(this, BackendServiceError.prototype);
  }
}

/**
 * Backend service that handles only backend communication
 * Does not deal with authentication or authorization
 */
export class BackendService {
  private client: BackendClient;

  constructor(client?: BackendClient) {
    this.client = client ?? createBackendClient();
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
      throw new BackendServiceError('Invalid endpoint', 400);
    }

    // Ensure endpoint starts with / to prevent potential path traversal
    if (!endpoint.startsWith('/')) {
      throw new BackendServiceError('Invalid endpoint format', 400);
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
        throw new BackendServiceError('Unsupported HTTP method', 400);
    }

    if (!response.success) {
      throw new BackendServiceError(
        response.error || 'Backend request failed',
        response.status,
        response.data
      );
    }

    // Ensure response.data exists before returning
    if (response.data === undefined) {
      throw new BackendServiceError('Backend response missing data', response.status);
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
      endpoint: `/api/account/${encodeURIComponent(accountId)}/pii/updateable-fields`,
      method: 'GET',
      authToken
    });
  }

  /**
   * Place a trade order for an account
   * @param accountId - The account ID (for validation, already verified by auth service)
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param tradeData - The trade order data
   * @param authToken - The user's authentication token
   * @returns Trade execution result
   */
  async placeTrade(accountId: string, userId: string, tradeData: any, authToken?: string) {
    return this.request({
      endpoint: '/api/trade',
      method: 'POST',
      body: tradeData,
      authToken
    });
  }

  /**
   * Get portfolio activities for an account
   * @param accountId - The account ID (for validation, already verified by auth service)
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param limit - Optional limit for number of activities
   * @param authToken - The user's authentication token
   * @returns Portfolio activities data
   */
  async getPortfolioActivities(accountId: string, userId: string, limit?: string | null, authToken?: string) {
    const queryParams = new URLSearchParams();
    queryParams.append('account_id', accountId); // Backend expects 'account_id', not 'accountId'
    if (limit) queryParams.append('limit', limit);
    
    return this.request({
      endpoint: `/api/portfolio/activities?${queryParams.toString()}`,
      method: 'GET',
      authToken
    });
  }

  /**
   * Get portfolio analytics for an account
   * @param accountId - The account ID (for validation, already verified by auth service)
   * @param userId - The user ID for authorization (not sent to backend, used for logging only)
   * @param authToken - The user's authentication token
   * @returns Portfolio analytics data
   */
  async getPortfolioAnalytics(accountId: string, userId: string, authToken?: string) {
    const queryParams = new URLSearchParams();
    queryParams.append('user_id', userId); // Add user_id for portfolio mode detection
    
    return this.request({
      endpoint: `/api/portfolio/${encodeURIComponent(accountId)}/analytics?${queryParams.toString()}`,
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
    if (error instanceof BackendServiceError) {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error && 'status' in error) {
      // Convert plain object to BackendServiceError
      return new BackendServiceError(
        (error as any).message,
        (error as any).status,
        (error as any).details
      );
    }
    if (error instanceof Error) {
      return new BackendServiceError(error.message, 500);
    }
    return new BackendServiceError('Backend service error', 500);
  }
} 