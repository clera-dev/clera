/**
 * Tests for secure error mapping system
 * 
 * These tests verify that the SecureErrorMapper correctly prevents
 * information disclosure while providing useful error messages to users.
 */

import { SecureErrorMapper } from '@/utils/services/errors';

describe('SecureErrorMapper Security Tests', () => {
  describe('Information Disclosure Prevention', () => {
    test('should not expose internal file paths', () => {
      const maliciousError = 'Error in /var/www/backend/app/services/database.py:123: Connection failed';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 500);
      
      expect(safeMessage).not.toContain('/var/www/backend');
      expect(safeMessage).not.toContain('database.py');
      expect(safeMessage).not.toContain(':123');
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should not expose database connection details', () => {
      const maliciousError = 'Database connection failed: postgresql://user:password@localhost:5432/clera_db';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 500);
      
      expect(safeMessage).not.toContain('postgresql://');
      expect(safeMessage).not.toContain('localhost:5432');
      expect(safeMessage).not.toContain('clera_db');
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should not expose internal service names', () => {
      const maliciousError = 'Service alpaca_market_data_service is down';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 503);
      
      expect(safeMessage).not.toContain('alpaca_market_data_service');
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should not expose stack traces', () => {
      const maliciousError = 'Traceback (most recent call last):\n  File "app.py", line 45, in <module>\n    result = process_data()\n  File "utils.py", line 23, in process_data\n    raise ValueError("Invalid data")';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 500);
      
      expect(safeMessage).not.toContain('Traceback');
      expect(safeMessage).not.toContain('File "app.py"');
      expect(safeMessage).not.toContain('line 45');
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should not expose configuration details', () => {
      const maliciousError = 'Configuration error: API_KEY not found in /etc/clera/config.json';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 500);
      
      expect(safeMessage).not.toContain('API_KEY');
      expect(safeMessage).not.toContain('/etc/clera/config.json');
      // The error contains "not found" which maps to a 404-style message
      expect(safeMessage).toBe('The requested resource was not found.');
    });

    test('should not expose error codes that reveal system architecture', () => {
      const maliciousError = 'Error 0x80004005: COM object initialization failed';
      const safeMessage = SecureErrorMapper.mapError(maliciousError, 500);
      
      expect(safeMessage).not.toContain('0x80004005');
      expect(safeMessage).not.toContain('COM object');
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });
  });

  describe('Safe Error Mapping', () => {
    test('should map authentication errors correctly', () => {
      const authErrors = [
        'authentication failed',
        'invalid token',
        'token expired',
        'unauthorized'
      ];
      
      authErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 401);
        // All authentication errors should map to authentication-related messages
        expect(safeMessage).toMatch(/(Authentication failed|session has expired|not authorized)/);
        expect(safeMessage).not.toContain(error);
      });
    });

    test('should map authorization errors correctly', () => {
      const authErrors = [
        'forbidden',
        'insufficient permissions',
        'access denied'
      ];
      
      authErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 403);
        // All authorization errors should map to permission-related messages
        expect(safeMessage).toMatch(/(permission|Access denied)/);
        expect(safeMessage).not.toContain(error);
      });
    });

    test('should map resource errors correctly', () => {
      const resourceErrors = [
        'resource not found',
        'symbol not found'
      ];
      
      resourceErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 404);
        expect(safeMessage).toContain('not found');
        expect(safeMessage).not.toContain(error);
      });
    });

    test('should map validation errors correctly', () => {
      const validationErrors = [
        'validation error',
        'invalid input',
        'bad request'
      ];
      
      validationErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 400);
        expect(safeMessage).toContain('invalid');
        expect(safeMessage).not.toContain(error);
      });
    });

    test('should map rate limiting errors correctly', () => {
      const rateLimitErrors = [
        'rate limit exceeded',
        'too many requests'
      ];
      
      rateLimitErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 429);
        expect(safeMessage).toContain('Too many requests');
        expect(safeMessage).not.toContain(error);
      });
    });

    test('should map trading errors correctly', () => {
      const tradingErrors = [
        'insufficient funds',
        'invalid order',
        'order rejected'
      ];
      
      tradingErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 400);
        // Trading errors should map to trade-related messages
        expect(safeMessage).toMatch(/(trade|order|funds)/);
        expect(safeMessage).not.toContain(error);
      });
    });
  });

  describe('Status Code Based Fallbacks', () => {
    test('should provide appropriate fallback for 400 errors', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 400);
      expect(safeMessage).toBe('The request is invalid. Please check your input and try again.');
    });

    test('should provide appropriate fallback for 401 errors', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 401);
      expect(safeMessage).toBe('Authentication failed. Please log in again.');
    });

    test('should provide appropriate fallback for 403 errors', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 403);
      expect(safeMessage).toBe('You do not have permission to perform this action.');
    });

    test('should provide appropriate fallback for 404 errors', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 404);
      expect(safeMessage).toBe('The requested resource was not found.');
    });

    test('should provide appropriate fallback for 429 errors', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 429);
      expect(safeMessage).toBe('Too many requests. Please wait a moment and try again.');
    });

    test('should provide appropriate fallback for 500+ errors', () => {
      const unknownError = 'some unknown error';
      const statusCodes = [500, 502, 503, 504];
      
      statusCodes.forEach(statusCode => {
        const safeMessage = SecureErrorMapper.mapError(unknownError, statusCode);
        expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
      });
    });

    test('should provide generic fallback for unknown status codes', () => {
      const unknownError = 'some unknown error';
      const safeMessage = SecureErrorMapper.mapError(unknownError, 999);
      expect(safeMessage).toBe('An unexpected error occurred. Please try again later.');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty error messages', () => {
      const safeMessage = SecureErrorMapper.mapError('', 500);
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should handle null/undefined error messages', () => {
      const safeMessage = SecureErrorMapper.mapError(null as any, 500);
      expect(safeMessage).toBe('The service is temporarily unavailable. Please try again later.');
    });

    test('should handle case-insensitive matching', () => {
      const upperCaseError = 'AUTHENTICATION FAILED';
      const mixedCaseError = 'Invalid Token';
      const lowerCaseError = 'authentication failed';
      
      const upperMessage = SecureErrorMapper.mapError(upperCaseError, 401);
      const mixedMessage = SecureErrorMapper.mapError(mixedCaseError, 401);
      const lowerMessage = SecureErrorMapper.mapError(lowerCaseError, 401);
      
      expect(upperMessage).toBe('Authentication failed. Please log in again.');
      expect(mixedMessage).toBe('Authentication failed. Please log in again.');
      expect(lowerMessage).toBe('Authentication failed. Please log in again.');
    });

    test('should handle partial matches', () => {
      const partialError = 'The authentication failed due to invalid credentials';
      const safeMessage = SecureErrorMapper.mapError(partialError, 401);
      expect(safeMessage).toBe('Authentication failed. Please log in again.');
    });
  });

  describe('Core Security Validation', () => {
    test('should prevent information disclosure in all scenarios', () => {
      const maliciousErrors = [
        'Error in /var/www/backend/app.py:123: Connection failed',
        'Database connection failed: postgresql://user:password@localhost:5432/clera_db',
        'Service alpaca_market_data_service is down',
        'Configuration error: API_KEY not found in /etc/clera/config.json',
        'Error 0x80004005: COM object initialization failed',
        'Traceback (most recent call last):\n  File "app.py", line 45, in <module>'
      ];
      
      maliciousErrors.forEach(error => {
        const safeMessage = SecureErrorMapper.mapError(error, 500);
        
        // Verify no sensitive information is exposed
        expect(safeMessage).not.toContain('/var/www/backend');
        expect(safeMessage).not.toContain('postgresql://');
        expect(safeMessage).not.toContain('alpaca_market_data_service');
        expect(safeMessage).not.toContain('API_KEY');
        expect(safeMessage).not.toContain('0x80004005');
        expect(safeMessage).not.toContain('Traceback');
        expect(safeMessage).not.toContain('File "app.py"');
        
        // Verify a safe message is returned
        expect(safeMessage).toMatch(/(service is temporarily unavailable|requested resource was not found)/);
      });
    });

    test('should provide consistent error mapping', () => {
      // Test that similar errors map to consistent messages
      const authErrors = ['authentication failed', 'invalid token', 'token expired'];
      
      authErrors.forEach(error => {
        const message = SecureErrorMapper.mapError(error, 401);
        // All authentication errors should map to authentication-related messages
        expect(message).toMatch(/(Authentication failed|session has expired)/);
      });
    });

    test('should handle mixed case and variations', () => {
      const variations = [
        'AUTHENTICATION FAILED',
        'Authentication Failed',
        'authentication failed',
        'Authentication failed',
        'AUTHENTICATION_FAILED'
      ];
      
      variations.forEach(variation => {
        const message = SecureErrorMapper.mapError(variation, 401);
        expect(message).toBe('Authentication failed. Please log in again.');
      });
    });
  });
}); 