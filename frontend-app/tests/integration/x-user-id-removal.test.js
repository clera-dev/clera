/**
 * Test to verify X-User-ID headers are no longer sent to backend
 * This test ensures the security vulnerability is fixed without breaking functionality
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock environment variables
process.env.BACKEND_API_URL = 'http://localhost:8000';
process.env.BACKEND_API_KEY = 'test_api_key_123';

// Mock Supabase
const mockSupabaseUser = {
  id: 'test_user_123',
  email: 'test@example.com'
};

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: mockSupabaseUser },
      error: null
    })
  }
};

// Mock the createClient function
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabaseClient)
}));

// Mock fetch for backend calls
global.fetch = jest.fn();

describe('X-User-ID Header Removal Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful backend responses for all tests
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"success": true}'),
      status: 200
    });
  });

  test('Market assets route should NOT send X-User-ID header', async () => {
    const { GET } = require('../../app/api/market/assets/route');
    const mockRequest = new Request('http://localhost:3000/api/market/assets');
    
    await GET(mockRequest);
    
    // Verify fetch was called without X-User-ID
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/market/assets',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-KEY': 'test_api_key_123',
          'Content-Type': 'application/json'
        })
      })
    );
    
    // Verify X-User-ID is NOT sent
    const [, options] = fetch.mock.calls[0];
    expect(options.headers).not.toHaveProperty('X-User-ID');
  });

  test('Market latest trade route should NOT send X-User-ID header', async () => {
    const { GET } = require('../../app/api/market/latest-trade/[symbol]/route');
    const mockRequest = new Request('http://localhost:3000/api/market/latest-trade/AAPL');
    
    await GET(mockRequest, { params: Promise.resolve({ symbol: 'AAPL' }) });
    
    // Verify fetch was called without X-User-ID
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/market/latest-trade/AAPL',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-KEY': 'test_api_key_123',
          'Content-Type': 'application/json'
        })
      })
    );
    
    // Verify X-User-ID is NOT sent
    const [, options] = fetch.mock.calls[0];
    expect(options.headers).not.toHaveProperty('X-User-ID');
  });

  test('Trade route should NOT send X-User-ID header', async () => {
    const { POST } = require('../../app/api/trade/route');
    const mockRequest = new Request('http://localhost:3000/api/trade', {
      method: 'POST',
      body: JSON.stringify({
        account_id: 'test_account_123',
        ticker: 'AAPL',
        side: 'BUY',
        notional_amount: 100
      })
    });
    
    await POST(mockRequest);
    
    // Verify fetch was called without X-User-ID
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/trade',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-API-KEY': 'test_api_key_123',
          'Content-Type': 'application/json'
        })
      })
    );
    
    // Verify X-User-ID is NOT sent
    const [, options] = fetch.mock.calls[0];
    expect(options.headers).not.toHaveProperty('X-User-ID');
  });

  test('All routes should still authenticate users properly', async () => {
    // Test that user authentication still works in frontend
    const { GET } = require('../../app/api/market/assets/route');
    const mockRequest = new Request('http://localhost:3000/api/market/assets');
    
    const response = await GET(mockRequest);
    
    // Verify Supabase auth was called
    expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled();
    
    // Verify response is successful
    expect(response.status).toBe(200);
  });

  test('Routes should return 401 when user authentication fails', async () => {
    // Mock authentication failure
    mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User not authenticated' }
    });

    const { GET } = require('../../app/api/market/assets/route');
    const mockRequest = new Request('http://localhost:3000/api/market/assets');
    
    const response = await GET(mockRequest);
    
    expect(response.status).toBe(401);
    
    // Verify backend was NOT called when auth fails
    expect(fetch).not.toHaveBeenCalled();
  });
});