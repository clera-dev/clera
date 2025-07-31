import { ApiError, SecureErrorMapper } from '../../utils/services/errors';

describe('SecureErrorMapper - Pattern Priority Testing', () => {
  describe('Specific Patterns Take Precedence', () => {
    it('should match specific authentication patterns before generic ones', () => {
      // Test that specific patterns are matched before generic ones
      const specificTokenExpired = SecureErrorMapper.mapError('token expired', 401);
      const genericAuthFailed = SecureErrorMapper.mapError('authentication failed', 401);
      
      expect(specificTokenExpired).toBe('Your session has expired. Please log in again.');
      expect(genericAuthFailed).toBe('Authentication failed. Please log in again.');
      
      // Test that "token expired" is matched specifically, not by "authentication failed"
      const tokenExpiredError = SecureErrorMapper.mapError('your token expired yesterday', 401);
      expect(tokenExpiredError).toBe('Your session has expired. Please log in again.');
    });

    it('should match specific resource patterns before generic "not found"', () => {
      // Test specific resource patterns
      const symbolNotFound = SecureErrorMapper.mapError('symbol not found', 404);
      const accountNotFound = SecureErrorMapper.mapError('account not found', 404);
      const orderNotFound = SecureErrorMapper.mapError('order not found', 404);
      const positionNotFound = SecureErrorMapper.mapError('position not found', 404);
      
      expect(symbolNotFound).toBe('The requested symbol was not found.');
      expect(accountNotFound).toBe('The requested account was not found.');
      expect(orderNotFound).toBe('The requested order was not found.');
      expect(positionNotFound).toBe('The requested position was not found.');
      
      // Test generic "not found" for other cases
      const genericNotFound = SecureErrorMapper.mapError('user not found', 404);
      expect(genericNotFound).toBe('The requested resource was not found.');
    });

    it('should match specific validation patterns before generic ones', () => {
      // Test specific validation patterns
      const missingField = SecureErrorMapper.mapError('missing required field', 400);
      const invalidFormat = SecureErrorMapper.mapError('invalid format', 400);
      const outOfRange = SecureErrorMapper.mapError('out of range', 400);
      
      expect(missingField).toBe('Required information is missing. Please check your input and try again.');
      expect(invalidFormat).toBe('The data format is invalid. Please check your input and try again.');
      expect(outOfRange).toBe('The provided value is outside the allowed range.');
      
      // Test generic validation patterns
      const genericValidation = SecureErrorMapper.mapError('validation error', 400);
      const genericInvalidInput = SecureErrorMapper.mapError('invalid input', 400);
      
      expect(genericValidation).toBe('The provided data is invalid. Please check your input and try again.');
      expect(genericInvalidInput).toBe('The provided data is invalid. Please check your input and try again.');
    });

    it('should match specific rate limiting patterns before generic ones', () => {
      // Test specific rate limiting patterns
      const rateLimitExceeded = SecureErrorMapper.mapError('rate limit exceeded', 429);
      const tooManyRequests = SecureErrorMapper.mapError('too many requests', 429);
      const throttled = SecureErrorMapper.mapError('throttled', 429);
      
      expect(rateLimitExceeded).toBe('Too many requests. Please wait a moment and try again.');
      expect(tooManyRequests).toBe('Too many requests. Please wait a moment and try again.');
      expect(throttled).toBe('Request throttled. Please wait before trying again.');
      
      // Test generic rate limiting pattern
      const genericRateLimit = SecureErrorMapper.mapError('rate limit', 429);
      expect(genericRateLimit).toBe('Rate limit exceeded. Please wait before making another request.');
    });

    it('should match specific market data patterns before generic ones', () => {
      // Test specific market data patterns
      const priceFeedUnavailable = SecureErrorMapper.mapError('price feed unavailable', 503);
      const marketDataError = SecureErrorMapper.mapError('market data error', 503);
      const marketDataUnavailable = SecureErrorMapper.mapError('market data unavailable', 503);
      
      expect(priceFeedUnavailable).toBe('Price information is temporarily unavailable.');
      expect(marketDataError).toBe('Unable to retrieve market data. Please try again later.');
      expect(marketDataUnavailable).toBe('Market data is currently unavailable. Please try again later.');
      
      // Test generic market patterns
      const marketClosed = SecureErrorMapper.mapError('market closed', 503);
      const tradingHours = SecureErrorMapper.mapError('trading hours', 503);
      
      expect(marketClosed).toBe('The market is currently closed.');
      expect(tradingHours).toBe('This action is only available during market hours.');
    });

    it('should match specific trading patterns before generic ones', () => {
      // Test specific trading patterns
      const orderTypeNotSupported = SecureErrorMapper.mapError('order type not supported', 400);
      const orderSizeLimit = SecureErrorMapper.mapError('order size limit', 400);
      const positionLimit = SecureErrorMapper.mapError('position limit', 400);
      
      expect(orderTypeNotSupported).toBe('This order type is not supported.');
      expect(orderSizeLimit).toBe('The order size exceeds the allowed limit.');
      expect(positionLimit).toBe('You have reached the maximum position limit for this symbol.');
      
      // Test generic trading patterns
      const insufficientFunds = SecureErrorMapper.mapError('insufficient funds', 400);
      const invalidOrder = SecureErrorMapper.mapError('invalid order', 400);
      
      expect(insufficientFunds).toBe('Insufficient funds to complete this trade.');
      expect(invalidOrder).toBe('The order is invalid. Please check your order details.');
    });

    it('should match specific network patterns before generic ones', () => {
      // Test specific network patterns
      const gatewayTimeout = SecureErrorMapper.mapError('gateway timeout', 504);
      const serviceUnavailable = SecureErrorMapper.mapError('service unavailable', 503);
      const networkError = SecureErrorMapper.mapError('network error', 500);
      
      expect(gatewayTimeout).toBe('The service is taking too long to respond. Please try again later.');
      expect(serviceUnavailable).toBe('The service is temporarily unavailable. Please try again later.');
      expect(networkError).toBe('Network connection error. Please check your connection and try again.');
      
      // Test generic network patterns
      const timeout = SecureErrorMapper.mapError('timeout', 408);
      const connectionError = SecureErrorMapper.mapError('connection error', 500);
      
      expect(timeout).toBe('The request timed out. Please try again later.');
      expect(connectionError).toBe('Unable to connect to the service. Please try again later.');
    });
  });

  describe('Generic Patterns as Fallbacks', () => {
    it('should use generic patterns only when no specific pattern matches', () => {
      // Test that generic patterns are used as fallbacks
      const genericServerError = SecureErrorMapper.mapError('server error', 500);
      const genericInternalError = SecureErrorMapper.mapError('internal server error', 500);
      const genericUnexpectedError = SecureErrorMapper.mapError('unexpected error', 500);
      
      expect(genericServerError).toBe('A server error occurred. Please try again later.');
      expect(genericInternalError).toBe('An internal error occurred. Please try again later.');
      expect(genericUnexpectedError).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should use status code fallbacks when no pattern matches', () => {
      // Test status code fallbacks
      const noPattern400 = SecureErrorMapper.mapError('some random error', 400);
      const noPattern401 = SecureErrorMapper.mapError('another random error', 401);
      const noPattern404 = SecureErrorMapper.mapError('yet another error', 404);
      const noPattern500 = SecureErrorMapper.mapError('server issue', 500);
      
      expect(noPattern400).toBe('The request is invalid. Please check your input and try again.');
      expect(noPattern401).toBe('Authentication failed. Please log in again.');
      expect(noPattern404).toBe('The requested resource was not found.');
      expect(noPattern500).toBe('The service is temporarily unavailable. Please try again later.');
    });
  });

  describe('Case Insensitive Matching', () => {
    it('should match patterns regardless of case', () => {
      // Test case insensitive matching
      const upperCase = SecureErrorMapper.mapError('TOKEN EXPIRED', 401);
      const mixedCase = SecureErrorMapper.mapError('Token Expired', 401);
      const lowerCase = SecureErrorMapper.mapError('token expired', 401);
      
      expect(upperCase).toBe('Your session has expired. Please log in again.');
      expect(mixedCase).toBe('Your session has expired. Please log in again.');
      expect(lowerCase).toBe('Your session has expired. Please log in again.');
    });

    it('should match patterns within longer error messages', () => {
      // Test pattern matching within longer messages
      const longMessage = SecureErrorMapper.mapError('The user token expired at 3:45 PM yesterday', 401);
      const complexMessage = SecureErrorMapper.mapError('Error: symbol not found in database', 404);
      const nestedMessage = SecureErrorMapper.mapError('API Error: rate limit exceeded for user 12345', 429);
      
      expect(longMessage).toBe('Your session has expired. Please log in again.');
      expect(complexMessage).toBe('The requested symbol was not found.');
      expect(nestedMessage).toBe('Too many requests. Please wait a moment and try again.');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty or null error messages', () => {
      const emptyError = SecureErrorMapper.mapError('', 500);
      const nullError = SecureErrorMapper.mapError(null as any, 500);
      const undefinedError = SecureErrorMapper.mapError(undefined as any, 500);
      
      expect(emptyError).toBe('The service is temporarily unavailable. Please try again later.');
      expect(nullError).toBe('The service is temporarily unavailable. Please try again later.');
      expect(undefinedError).toBe('The service is temporarily unavailable. Please try again later.');
    });

    it('should handle unknown status codes', () => {
      const unknownStatus = SecureErrorMapper.mapError('some error', 999);
      expect(unknownStatus).toBe('An unexpected error occurred. Please try again later.');
    });
  });

  describe('ApiError Class', () => {
    it('should create ApiError instances correctly', () => {
      const error = new ApiError('Test error message', 400);
      
      expect(error.message).toBe('Test error message');
      expect(error.status).toBe(400);
      expect(error.name).toBe('ApiError');
      expect(error instanceof ApiError).toBe(true);
    });

    it('should maintain proper prototype chain', () => {
      const error = new ApiError('Test error', 500);
      
      // Test that instanceof works correctly after transpilation
      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Error Logging', () => {
    it('should log errors with proper structure', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      SecureErrorMapper.logError('test error', 500, '/api/test', { userId: '123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SecureErrorMapper] Backend Error:',
        expect.stringContaining('test error')
      );
      
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][1]);
      expect(loggedData).toMatchObject({
        statusCode: 500,
        path: '/api/test',
        backendError: 'test error',
        userId: '123'
      });
      
      consoleSpy.mockRestore();
    });
  });
}); 