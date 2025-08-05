/**
 * Production-Grade API Route Tests for Order Cancellation
 * 
 * This test suite validates the Next.js API route for order cancellation,
 * ensuring proper authentication, request handling, and error scenarios.
 */

import { createMocks } from 'node-mocks-http';
import handler from '../../app/api/portfolio/orders/cancel/[accountId]/[orderId]/route';

// Mock the AuthService
const mockAuthService = {
  authenticateAndAuthorize: jest.fn(),
  handleAuthError: jest.fn()
};

jest.mock('../../utils/api/auth-service', () => ({
  AuthService: mockAuthService
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('/api/portfolio/orders/cancel/[accountId]/[orderId] Route', () => {
  const mockAccountId = '12345678-1234-1234-1234-123456789012';
  const mockOrderId = '87654321-4321-4321-4321-210987654321';
  const mockUserId = 'user-123';
  const mockToken = 'jwt-token-123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default environment variables
    process.env.BACKEND_API_URL = 'https://api.test.com';
    process.env.BACKEND_API_KEY = 'test-api-key';
    
    // Setup default auth mock
    mockAuthService.authenticateAndAuthorize.mockResolvedValue({
      user: { id: mockUserId },
      accountId: mockAccountId,
      authToken: mockToken
    });
  });

  afterEach(() => {
    delete process.env.BACKEND_API_URL;
    delete process.env.BACKEND_API_KEY;
  });

  describe('DELETE Method', () => {
    test('successfully cancels order with proper authentication', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          success: true,
          message: `Order ${mockOrderId} has been successfully cancelled`,
          order_id: mockOrderId,
          account_id: mockAccountId
        }))
      });

      const { req, res } = createMocks({
        method: 'DELETE',
      });

      // Mock the params object that Next.js provides
      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.order_id).toBe(mockOrderId);
      expect(data.account_id).toBe(mockAccountId);

      // Verify auth was called
      expect(mockAuthService.authenticateAndAuthorize).toHaveBeenCalledWith(req, mockAccountId);

      // Verify backend was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/portfolio/${mockAccountId}/orders/${mockOrderId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-api-key',
            'Authorization': `Bearer ${mockToken}`,
          },
          cache: 'no-store'
        }
      );
    });

    test('handles authentication failure', async () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      
      mockAuthService.authenticateAndAuthorize.mockRejectedValue(authError);
      mockAuthService.handleAuthError.mockReturnValue({
        message: 'Unauthorized',
        status: 401
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(fetch).not.toHaveBeenCalled();
    });

    test('handles missing backend configuration', async () => {
      delete process.env.BACKEND_API_URL;

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server configuration error');
      expect(fetch).not.toHaveBeenCalled();
    });

    test('handles order not found error from backend', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({
          detail: 'Order not found'
        }))
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Order not found or already processed');
    });

    test('handles order cannot be cancelled error from backend', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve(JSON.stringify({
          detail: 'Order is filled and cannot be cancelled'
        }))
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.error).toBe('Order cannot be cancelled (may be filled or already cancelled)');
    });

    test('handles backend server error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe('Server error while cancelling order. Please try again.');
    });

    test('handles invalid JSON response from backend', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('invalid json')
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(502);
      expect(data.error).toBe('Invalid response from backend service');
    });

    test('handles network error during backend call', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      mockAuthService.handleAuthError.mockReturnValue({
        message: 'Internal server error',
        status: 500
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    test('properly maps backend error status codes', async () => {
      const testCases = [
        { backendStatus: 400, expectedStatus: 400 },
        { backendStatus: 403, expectedStatus: 403 },
        { backendStatus: 404, expectedStatus: 404 },
        { backendStatus: 422, expectedStatus: 422 },
        { backendStatus: 500, expectedStatus: 502 },
        { backendStatus: 502, expectedStatus: 502 },
        { backendStatus: 503, expectedStatus: 502 }
      ];

      for (const testCase of testCases) {
        fetch.mockResolvedValueOnce({
          ok: false,
          status: testCase.backendStatus,
          text: () => Promise.resolve(JSON.stringify({
            detail: `Error ${testCase.backendStatus}`
          }))
        });

        const { req } = createMocks({
          method: 'DELETE',
        });

        const params = Promise.resolve({
          accountId: mockAccountId,
          orderId: mockOrderId
        });

        const response = await handler.DELETE(req, { params });
        
        expect(response.status).toBe(testCase.expectedStatus);
        
        // Reset mocks for next iteration
        jest.clearAllMocks();
        mockAuthService.authenticateAndAuthorize.mockResolvedValue({
          user: { id: mockUserId },
          accountId: mockAccountId,
          authToken: mockToken
        });
      }
    });

    test('includes all required security headers in backend request', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true }))
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      await handler.DELETE(req, { params });

      const fetchCall = fetch.mock.calls[0];
      const [url, options] = fetchCall;

      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key',
        'Authorization': `Bearer ${mockToken}`,
      });
      
      expect(options.method).toBe('DELETE');
      expect(options.cache).toBe('no-store');
    });

    test('logs cancellation request for debugging', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true }))
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      await handler.DELETE(req, { params });

      expect(consoleSpy).toHaveBeenCalledWith(
        `Cancelling order ${mockOrderId} for account ${mockAccountId}`
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Security Tests', () => {
    test('prevents access without proper authentication', async () => {
      mockAuthService.authenticateAndAuthorize.mockRejectedValue(
        new Error('Authentication required')
      );
      
      mockAuthService.handleAuthError.mockReturnValue({
        message: 'Authentication required',
        status: 401
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
      expect(fetch).not.toHaveBeenCalled();
    });

    test('prevents cross-account access', async () => {
      const otherAccountId = '99999999-9999-9999-9999-999999999999';
      
      mockAuthService.authenticateAndAuthorize.mockRejectedValue(
        new Error('Unauthorized access to account')
      );
      
      mockAuthService.handleAuthError.mockReturnValue({
        message: 'Unauthorized access to account',
        status: 403
      });

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: otherAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Unauthorized access to account');
      expect(fetch).not.toHaveBeenCalled();
    });

    test('does not expose sensitive configuration in error messages', async () => {
      delete process.env.BACKEND_API_KEY;

      const { req } = createMocks({
        method: 'DELETE',
      });

      const params = Promise.resolve({
        accountId: mockAccountId,
        orderId: mockOrderId
      });

      const response = await handler.DELETE(req, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server configuration error');
      // Should not expose that specifically the API key is missing
      expect(data.error).not.toContain('API_KEY');
    });
  });
});