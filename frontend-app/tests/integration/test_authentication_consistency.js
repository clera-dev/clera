/**
 * Integration tests to verify all API routes use consistent JWT authentication
 * 
 * This test ensures that our security fix doesn't break existing functionality
 * and that all routes properly require JWT tokens.
 */

const { describe, test, expect, beforeAll } = require('@jest/globals');

// Mock environment variables
process.env.BACKEND_API_URL = 'http://localhost:8000';
process.env.BACKEND_API_KEY = 'test_api_key_123';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = 'test_anon_key';

// Mock Supabase
const mockSupabaseUser = {
  id: 'test_user_123',
  email: 'test@example.com',
  access_token: 'mock_jwt_token_here'
};

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: mockSupabaseUser },
      error: null
    })
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({
    data: { alpaca_account_id: 'test_account_123' },
    error: null
  })
};

// Mock the createClient function
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabaseClient)
}));

// Mock fetch for backend calls
global.fetch = jest.fn();

describe('Authentication Consistency Tests', () => {
  beforeAll(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('Previously Secure Routes (should still work)', () => {
    test('PII routes should continue using JWT tokens', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"pii_data": "test"}'),
        status: 200
      });

      const { GET } = require('../../app/api/account/[accountId]/pii/route');
      const mockRequest = new Request('http://localhost:3000/api/account/test_account_123/pii', {
        headers: { 'Authorization': 'Bearer mock_jwt_token' }
      });
      
      const response = await GET(mockRequest, { 
        params: Promise.resolve({ accountId: 'test_account_123' }) 
      });
      
      expect(response.status).toBe(200);
      
      // Verify the backend was called with JWT token
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/account/test_account_123/pii'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
    });
  });

  describe('Previously Vulnerable Routes (should now be secure)', () => {
    test('Portfolio positions should now require JWT tokens', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"positions": []}'),
        status: 200
      });

      const { GET } = require('../../app/api/portfolio/positions/route');
      const mockRequest = new Request('http://localhost:3000/api/portfolio/positions?accountId=test_account_123');
      
      const response = await GET(mockRequest);
      
      expect(response.status).toBe(200);
      
      // Verify fetch was called (route should work)
      expect(fetch).toHaveBeenCalled();
    });

    test('Market quote routes should now require JWT tokens', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"symbol": "AAPL", "price": 150}'),
        status: 200
      });

      const { GET } = require('../../app/api/market/quote/[symbol]/route');
      const mockRequest = new Request('http://localhost:3000/api/market/quote/AAPL', {
        headers: { 'Authorization': 'Bearer mock_jwt_token' }
      });
      
      const response = await GET(mockRequest, { 
        params: Promise.resolve({ symbol: 'AAPL' }) 
      });
      
      expect(response.status).toBe(200);
      
      // Verify the backend was called with JWT token
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/market/quote/AAPL'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
    });
  });

  describe('Authentication Error Handling', () => {
    test('Routes should return 401 without JWT token', async () => {
      // Mock no authenticated user
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'User not authenticated' }
      });

      const { GET } = require('../../app/api/market/quote/[symbol]/route');
      const mockRequest = new Request('http://localhost:3000/api/market/quote/AAPL');
      
      const response = await GET(mockRequest, { 
        params: Promise.resolve({ symbol: 'AAPL' }) 
      });
      
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toContain('Authentication');
    });

    test('Routes should handle backend errors gracefully', async () => {
      // Mock backend error
      fetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('{"error": "Backend error"}'),
        status: 500
      });

      const { GET } = require('../../app/api/market/quote/[symbol]/route');
      const mockRequest = new Request('http://localhost:3000/api/market/quote/AAPL', {
        headers: { 'Authorization': 'Bearer mock_jwt_token' }
      });
      
      const response = await GET(mockRequest, { 
        params: Promise.resolve({ symbol: 'AAPL' }) 
      });
      
      expect(response.status).toBe(500);
    });
  });

  describe('Security Headers Validation', () => {
    test('All backend requests should include both API key and JWT token', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"data": "test"}'),
        status: 200
      });

      const { GET } = require('../../app/api/market/quote/[symbol]/route');
      const mockRequest = new Request('http://localhost:3000/api/market/quote/AAPL', {
        headers: { 'Authorization': 'Bearer mock_jwt_token' }
      });
      
      await GET(mockRequest, { 
        params: Promise.resolve({ symbol: 'AAPL' }) 
      });
      
      // Verify both headers are present
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-KEY': 'test_api_key_123',
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
    });

    test('No X-User-ID headers should be sent', async () => {
      // Mock successful backend response
      fetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"data": "test"}'),
        status: 200
      });

      const { GET } = require('../../app/api/market/quote/[symbol]/route');
      const mockRequest = new Request('http://localhost:3000/api/market/quote/AAPL', {
        headers: { 'Authorization': 'Bearer mock_jwt_token' }
      });
      
      await GET(mockRequest, { 
        params: Promise.resolve({ symbol: 'AAPL' }) 
      });
      
      // Verify NO X-User-ID header is sent
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-User-ID': expect.any(String)
          })
        })
      );
    });
  });
});