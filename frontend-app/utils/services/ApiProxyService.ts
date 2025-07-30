/**
 * Service for handling API proxying logic.
 * 
 * This service encapsulates the logic for proxying requests to backend services,
 * including URL construction, request execution, and response processing.
 */

import { NextResponse } from 'next/server';
import { type BackendConfig, createBackendHeaders } from '@/lib/utils/api-route-helpers';

export interface ProxyRequest {
  backendPath: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  additionalHeaders?: Record<string, string>;
}

export interface ProxyResponse {
  data: any;
  status: number;
  headers?: Record<string, string>;
}

export class ApiProxyService {
  private static instance: ApiProxyService;

  private constructor() {}

  public static getInstance(): ApiProxyService {
    if (!ApiProxyService.instance) {
      ApiProxyService.instance = new ApiProxyService();
    }
    return ApiProxyService.instance;
  }

  /**
   * Proxy a request to the backend service
   */
  public async proxyRequest(
    config: BackendConfig,
    userId: string,
    request: ProxyRequest
  ): Promise<NextResponse> {
    try {
      const targetUrl = `${config.url}${request.backendPath}`;
      
      // Prepare headers
      const headers = {
        ...createBackendHeaders(config, userId),
        ...request.additionalHeaders,
      };

      // Execute the request
      const response = await fetch(targetUrl, {
        method: request.method || 'GET',
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      // Process response
      const result = await this.processResponse(response);
      return result;

    } catch (error: any) {
      console.error(`[API Proxy] Request failed for ${request.backendPath}:`, error);
      return NextResponse.json(
        { error: 'Proxy request failed' },
        { status: 500 }
      );
    }
  }

  /**
   * Process the backend response and handle errors appropriately
   */
  private async processResponse(response: Response): Promise<NextResponse> {
    const responseText = await response.text();
    let responseData;
    
    // Parse response
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('[API Proxy] Failed to parse backend JSON response:', parseError);
      return NextResponse.json(
        { error: 'Invalid response from backend service.' },
        { status: 502 }
      );
    }

    // Handle non-OK responses
    if (!response.ok) {
      return this.handleErrorResponse(response, responseData);
    }

    // Return successful response
    return NextResponse.json(responseData, { status: response.status });
  }

  /**
   * Handle error responses from the backend
   */
  private handleErrorResponse(response: Response, responseData: any): NextResponse {
    let errorMessage = 'Request failed. Please try again later.';
    
    if (response.status >= 500) {
      // Hide backend details for server errors
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    } else {
      // For 4xx, try to pass backend error detail if available
      const backendError = responseData?.error || responseData?.detail || errorMessage;
      return NextResponse.json({ error: backendError }, { status: response.status });
    }
  }

  /**
   * Build query string from parameters
   */
  public buildQueryString(params: Record<string, string | null | undefined>): string {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.append(key, value);
      }
    });
    
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Create a backend path with query parameters
   */
  public createBackendPath(basePath: string, params: Record<string, string | null | undefined>): string {
    const queryString = this.buildQueryString(params);
    return `${basePath}${queryString}`;
  }
} 