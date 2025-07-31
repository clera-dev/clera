/**
 * Service for handling API proxying logic.
 * 
 * This service encapsulates the logic for proxying requests to backend services,
 * including URL construction, request execution, and response processing.
 * 
 * DESIGN PATTERN: This service is framework-agnostic. It returns raw data or
 * throws a structured `ApiError`, leaving the responsibility of creating HTTP
 * responses (`NextResponse`) to the API route layer. This ensures separation of
 * concerns and high testability.
 */
import { type BackendConfig, createBackendHeaders } from '@/lib/utils/api-route-helpers';
import { ApiError, SecureErrorMapper } from './errors';

export interface ProxyRequest {
  backendPath: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  additionalHeaders?: Record<string, string>;
}

export interface ProxyResponse<T = any> {
  data: T;
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
   * Proxy a request to the backend service and get raw data.
   * 
   * SECURITY: This method prevents header injection by ensuring critical headers
   * (`X-API-KEY`, `X-User-ID`) cannot be overridden by `additionalHeaders`.
   * 
   * @throws {ApiError} - Throws a structured `ApiError` for any request failures,
   *                      which can be caught and converted to a `NextResponse`
   *                      at the API route layer.
   */
  public async proxy<T = any>(
    config: BackendConfig,
    userId: string,
    request: ProxyRequest
  ): Promise<ProxyResponse<T>> {
    try {
      const targetUrl = `${config.url}${request.backendPath}`;
      
      const secureHeaders = createBackendHeaders(config, userId);
      const safeAdditionalHeaders = this.sanitizeAdditionalHeaders(request.additionalHeaders);
      
      const headers = {
        ...safeAdditionalHeaders,
        ...secureHeaders,
      };

      const response = await fetch(targetUrl, {
        method: request.method || 'GET',
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      return await this.processResponse<T>(response, request.backendPath);

    } catch (error: any) {
      // If the error is already an ApiError, re-throw it
      if (error instanceof ApiError) {
        throw error;
      }
      // Otherwise, wrap it in a generic ApiError
      console.error(`[API Proxy] Unhandled exception for ${request.backendPath}:`, error);
      throw new ApiError('Proxy request failed due to an unexpected error.', 500);
    }
  }

  /**
   * Process the backend response and handle errors.
   * 
   * @throws {ApiError} - Throws for non-ok responses or parsing failures.
   */
  private async processResponse<T>(response: Response, path: string): Promise<ProxyResponse<T>> {
    const contentType = response.headers.get('content-type') || '';
    const isJsonResponse = contentType.includes('application/json');

    if (!isJsonResponse) {
      console.error(`[API Proxy] Received non-JSON response from backend. Content-Type: ${contentType}, Path: ${path}`);
      if (!response.ok) {
        throw new ApiError('Backend service returned an invalid response format.', response.status);
      }
      
      // For successful non-JSON responses, we can't return structured data.
      // This case should be handled based on specific needs. For now, we'll
      // treat it as an error because our proxy expects JSON.
      throw new ApiError('Unsupported content type received from backend.', 502);
    }
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('[API Proxy] Failed to parse backend JSON response:', parseError);
      throw new ApiError('Invalid JSON response from backend service.', 502);
    }

    if (!response.ok) {
      this.handleErrorResponse(response, responseData, path);
    }

    return {
      data: responseData as T,
      status: response.status
    };
  }

  /**
   * Handle error responses from the backend.
   * 
   * SECURITY: This method logs the detailed backend error but throws a sanitized
   * `ApiError` to prevent information disclosure.
   * 
   * @throws {ApiError} - Always throws a sanitized `ApiError`.
   */
  private handleErrorResponse(response: Response, responseData: any, path: string): never {
    const backendError = responseData?.error || responseData?.detail || 'Unknown backend error';
    
    SecureErrorMapper.logError(backendError, response.status, path);
    
    const safeErrorMessage = SecureErrorMapper.mapError(backendError, response.status);
    
    throw new ApiError(safeErrorMessage, response.status);
  }

  public buildQueryString(params: Record<string, string | number | null | undefined>): string {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.append(key, String(value));
      }
    });
    
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  public createBackendPath(basePath: string, params: Record<string, string | number | null | undefined>): string {
    const queryString = this.buildQueryString(params);
    return `${basePath}${queryString}`;
  }

  private sanitizeAdditionalHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    if (!additionalHeaders) {
      return {};
    }

    const sensitiveHeaders = [
      'x-api-key', 'authorization', 'x-user-id', 'cookie', 'set-cookie',
      'x-forwarded-for', 'x-real-ip', 'host', 'content-length'
    ];

    const sanitizedHeaders: Record<string, string> = {};

    Object.entries(additionalHeaders).forEach(([key, value]) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        console.warn(`[SECURITY] Attempted to override sensitive header '${key}' in ApiProxyService. Blocked.`);
        return;
      }
      sanitizedHeaders[key] = value;
    });

    return sanitizedHeaders;
  }
}
