/**
 * Test suite for ApiError class
 * 
 * This test verifies that the ApiError class properly handles:
 * 1. instanceof checks in compiled JavaScript
 * 2. Prototype inheritance
 * 3. Error properties and methods
 * 4. Layered error handling patterns
 */

import { ApiError } from '../../utils/services/errors';

describe('ApiError', () => {
  describe('instanceof checks', () => {
    it('should pass instanceof ApiError check', () => {
      const error = new ApiError('Test error', 400);
      expect(error instanceof ApiError).toBe(true);
    });

    it('should pass instanceof Error check', () => {
      const error = new ApiError('Test error', 400);
      expect(error instanceof Error).toBe(true);
    });

    it('should work in try-catch blocks', () => {
      try {
        throw new ApiError('Test error', 500);
      } catch (error) {
        expect(error instanceof ApiError).toBe(true);
        expect(error instanceof Error).toBe(true);
      }
    });

    it('should work with async error handling', async () => {
      const asyncFunction = async () => {
        throw new ApiError('Async error', 404);
      };

      try {
        await asyncFunction();
      } catch (error) {
        expect(error instanceof ApiError).toBe(true);
        expect(error instanceof Error).toBe(true);
      }
    });
  });

  describe('error properties', () => {
    it('should have correct name property', () => {
      const error = new ApiError('Test error', 400);
      expect(error.name).toBe('ApiError');
    });

    it('should have correct message property', () => {
      const message = 'Custom error message';
      const error = new ApiError(message, 400);
      expect(error.message).toBe(message);
    });

    it('should have correct status property', () => {
      const status = 500;
      const error = new ApiError('Test error', status);
      expect(error.status).toBe(status);
    });

    it('should have readonly status property', () => {
      const error = new ApiError('Test error', 400);
      
      // TypeScript should prevent this, but let's test runtime behavior
      expect(() => {
        (error as any).status = 500;
      }).toThrow();
    });
  });

  describe('prototype chain', () => {
    it('should have correct prototype chain', () => {
      const error = new ApiError('Test error', 400);
      
      expect(Object.getPrototypeOf(error)).toBe(ApiError.prototype);
      expect(Object.getPrototypeOf(ApiError.prototype)).toBe(Error.prototype);
    });

    it('should have correct constructor', () => {
      const error = new ApiError('Test error', 400);
      expect(error.constructor).toBe(ApiError);
    });
  });

  describe('error handling patterns', () => {
    it('should work with layered error handling', () => {
      const handleApiError = (error: unknown) => {
        if (error instanceof ApiError) {
          return { status: error.status, message: error.message };
        }
        return { status: 500, message: 'Unknown error' };
      };

      const apiError = new ApiError('API error', 404);
      const result = handleApiError(apiError);
      
      expect(result).toEqual({ status: 404, message: 'API error' });
    });

    it('should work with error mapping', () => {
      const errorMap = new Map([
        [400, 'Bad Request'],
        [404, 'Not Found'],
        [500, 'Internal Server Error']
      ]);

      const getErrorType = (error: unknown) => {
        if (error instanceof ApiError) {
          return errorMap.get(error.status) || 'Unknown';
        }
        return 'Unknown';
      };

      const error = new ApiError('Not found', 404);
      expect(getErrorType(error)).toBe('Not Found');
    });

    it('should work with error serialization', () => {
      const error = new ApiError('Test error', 400);
      
      const serialized = {
        name: error.name,
        message: error.message,
        status: error.status,
        stack: error.stack
      };

      expect(serialized.name).toBe('ApiError');
      expect(serialized.message).toBe('Test error');
      expect(serialized.status).toBe(400);
      expect(serialized.stack).toBeDefined();
    });
  });

  describe('compiled JavaScript compatibility', () => {
    it('should work after transpilation simulation', () => {
      // Simulate what happens after TypeScript compilation
      const createError = (message: string, status: number) => {
        const error = new ApiError(message, status);
        return error;
      };

      const error = createError('Compiled error', 422);
      
      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('Compiled error');
      expect(error.status).toBe(422);
    });

    it('should work with dynamic error creation', () => {
      const createApiError = (message: string, status: number) => {
        return new ApiError(message, status);
      };

      const errors = [
        createApiError('Error 1', 400),
        createApiError('Error 2', 404),
        createApiError('Error 3', 500)
      ];

      errors.forEach(error => {
        expect(error instanceof ApiError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });
  });

  describe('error inheritance', () => {
    it('should inherit Error methods', () => {
      const error = new ApiError('Test error', 400);
      
      expect(typeof error.toString).toBe('function');
      expect(typeof error.stack).toBe('string');
    });

    it('should have proper stack trace', () => {
      const error = new ApiError('Test error', 400);
      
      expect(error.stack).toContain('ApiError');
      expect(error.stack).toContain('Test error');
    });
  });
}); 