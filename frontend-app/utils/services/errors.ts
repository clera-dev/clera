/**
 * Shared Error System for API Layer
 * 
 * This module provides a standardized `ApiError` class and a `SecureErrorMapper`
 * to ensure consistent, secure error handling across the Next.js API layer.
 * 
 * DESIGN PATTERN:
 * - The service layer (`ApiProxyService`) should be framework-agnostic.
 * - Services throw `ApiError` for predictable, structured errors.
 * - API routes (`/app/api/...`) catch `ApiError` and use `convertErrorToResponse`
 *   to translate it into a Next.js `NextResponse`.
 * 
 * This separates business logic from the HTTP framework, improving testability
 * and maintainability.
 */

/**
 * Custom error class for API-related failures.
 * 
 * This class provides a structured way to represent errors from backend services,
 * ensuring that the service layer remains decoupled from the HTTP framework.
 * 
 * It contains a `status` code and a `message`, which can be safely mapped
 * to an HTTP response in the API route layer.
 */
export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    
    // SECURITY: Fix prototype chain for proper instanceof checks after transpilation
    // This ensures ApiError instances are correctly recognized across the app
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Secure Error Mapping System
 * 
 * This utility provides centralized error mapping to prevent information disclosure
 * while maintaining useful error messages for users. It follows industry best practices
 * for security and maintainability.
 * 
 * SECURITY: This system maps backend error messages to safe, generic messages
 * that don't leak internal implementation details or sensitive information.
 */
export class SecureErrorMapper {
  /**
   * Comprehensive error mappings for different error categories
   * 
   * SECURITY: These mappings ensure no sensitive information is exposed
   * while providing actionable error messages to users.
   */
  private static readonly ERROR_MAPPINGS = {
    // SPECIFIC PATTERNS FIRST (Most specific to least specific within each category)
    
    // Authentication errors - Specific first
    'token expired': 'Your session has expired. Please log in again.',
    'invalid token': 'Authentication failed. Please log in again.',
    'invalid credentials': 'Authentication failed. Please check your credentials and try again.',
    'login required': 'Please log in to access this resource.',
    'authentication failed': 'Authentication failed. Please log in again.',
    'unauthorized': 'You are not authorized to perform this action.',
    
    // Authorization errors - Specific first
    'insufficient permissions': 'You do not have permission to perform this action.',
    'permission denied': 'You do not have the required permissions for this action.',
    'role required': 'You need additional permissions to perform this action.',
    'access denied': 'Access denied. Please contact support if you believe this is an error.',
    'forbidden': 'You do not have permission to access this resource.',
    
    // Resource errors - Specific first
    'symbol not found': 'The requested symbol was not found.',
    'account not found': 'The requested account was not found.',
    'order not found': 'The requested order was not found.',
    'position not found': 'The requested position was not found.',
    'resource not found': 'The requested resource was not found.',
    'invalid symbol': 'The provided symbol is not valid.',
    'not found': 'The requested resource was not found.',
    
    // Validation errors - Specific first
    'missing required field': 'Required information is missing. Please check your input and try again.',
    'invalid format': 'The data format is invalid. Please check your input and try again.',
    'out of range': 'The provided value is outside the allowed range.',
    'validation error': 'The provided data is invalid. Please check your input and try again.',
    'invalid input': 'The provided data is invalid. Please check your input and try again.',
    'bad request': 'The request is invalid. Please check your input and try again.',
    
    // Rate limiting - Specific first
    'rate limit exceeded': 'Too many requests. Please wait a moment and try again.',
    'too many requests': 'Too many requests. Please wait a moment and try again.',
    'throttled': 'Request throttled. Please wait before trying again.',
    'rate limit': 'Rate limit exceeded. Please wait before making another request.',
    
    // Market data errors - Specific first
    'price feed unavailable': 'Price information is temporarily unavailable.',
    'market data error': 'Unable to retrieve market data. Please try again later.',
    'market data unavailable': 'Market data is currently unavailable. Please try again later.',
    'market closed': 'The market is currently closed.',
    'trading hours': 'This action is only available during market hours.',
    
    // Trading errors - Specific first
    'order type not supported': 'This order type is not supported.',
    'order size limit': 'The order size exceeds the allowed limit.',
    'position limit': 'You have reached the maximum position limit for this symbol.',
    'price out of range': 'The order price is outside the allowed range.',
    'trading suspended': 'Trading is currently suspended for this symbol.',
    'order rejected': 'The order was rejected. Please try again or contact support.',
    'invalid order': 'The order is invalid. Please check your order details.',
    'insufficient funds': 'Insufficient funds to complete this trade.',
    
    // Network and connection errors - Specific first
    'gateway timeout': 'The service is taking too long to respond. Please try again later.',
    'service unavailable': 'The service is temporarily unavailable. Please try again later.',
    'network error': 'Network connection error. Please check your connection and try again.',
    'timeout': 'The request timed out. Please try again later.',
    'connection error': 'Unable to connect to the service. Please try again later.',
    
    // GENERIC PATTERNS LAST (Most generic patterns at the end)
    'processing error': 'An error occurred while processing your request.',
    'unexpected error': 'An unexpected error occurred. Please try again later.',
    'system error': 'A system error occurred. Please try again later.',
    'internal server error': 'An internal error occurred. Please try again later.',
    'server error': 'A server error occurred. Please try again later.',
  };

  /**
   * Map a backend error message to a safe, generic message
   * 
   * This method prevents information disclosure by mapping specific backend errors
   * to safe, user-friendly messages that don't leak internal details.
   * 
   * @param backendError - The original backend error message
   * @param statusCode - HTTP status code for additional context
   * @returns A safe error message that doesn't leak sensitive information
   */
  public static mapError(backendError: string, statusCode: number): string {
    if (!backendError) {
      return this.getDefaultError(statusCode);
    }

    const lowerError = backendError.toLowerCase();
    
    // Try to find a specific mapping
    for (const [pattern, safeMessage] of Object.entries(this.ERROR_MAPPINGS)) {
      if (lowerError.includes(pattern)) {
        return safeMessage;
      }
    }

    // If no specific mapping found, return a generic message based on status code
    return this.getDefaultError(statusCode);
  }

  /**
   * Get a default error message based on HTTP status code
   * 
   * Provides appropriate fallback messages when no specific error mapping is found.
   * 
   * @param statusCode - HTTP status code
   * @returns A safe default error message
   */
  private static getDefaultError(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'The request is invalid. Please check your input and try again.';
      case 401:
        return 'Authentication failed. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 405:
        return 'This method is not allowed for this resource.';
      case 409:
        return 'The request conflicts with the current state of the resource.';
      case 422:
        return 'The request was well-formed but contains invalid data.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'The service is temporarily unavailable. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }

  /**
   * Log backend error details for debugging while keeping them secure
   * 
   * This method logs the full backend error for debugging purposes but ensures
   * that sensitive information is never exposed to the client.
   * 
   * @param backendError - The original backend error
   * @param statusCode - HTTP status code
   * @param path - The API path that was called
   * @param additionalContext - Optional additional context for debugging
   */
  public static logError(
    backendError: string, 
    statusCode: number, 
    path: string, 
    additionalContext?: Record<string, any>
  ): void {
    const logData = {
      timestamp: new Date().toISOString(),
      statusCode,
      path,
      backendError,
      ...(additionalContext ?? {})
    };
    
    // Log the error for debugging but don't expose it to the client
    console.error('[SecureErrorMapper] Backend Error:', JSON.stringify(logData, null, 2));
  }
}
