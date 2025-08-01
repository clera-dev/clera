/**
 * Test for the fixed portfolio positions route
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// Mock environment variables
process.env.BACKEND_API_URL = 'http://localhost:8000';
process.env.BACKEND_API_KEY = 'test_api_key_123';

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

// Mock the secure backend helpers
jest.mock('@/utils/api/secure-backend-helpers', () => ({
  authenticateWithJWT: jest.fn().mockResolvedValue({
    user: mockSupabaseUser,
    accessToken: 'mock_jwt_token_here'
  }),
  createSecureBackendHeaders: jest.fn().mockResolvedValue({
    'Content-Type': 'application/json',
    'X-API-KEY': 'test_api_key_123',
    'Authorization': 'Bearer mock_jwt_token_here'
  }),
  getBackendConfig: jest.fn().mockReturnValue({
    url: 'http://localhost:8000',
    apiKey: 'test_api_key_123'
  })
}));

// Mock Supabase client creation
jest.doMock('@/utils/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue(mockSupabaseClient)
}));

// Mock fetch for backend calls
global.fetch = jest.fn();

describe('Portfolio Positions Route (Fixed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully get portfolio positions with JWT authentication', async () => {
    // Mock successful backend response
    fetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('{"positions": [{"symbol": "AAPL", "qty": 10}]}'),
      status: 200
    });

    const { GET } = require('../../app/api/portfolio/positions/route');
    const mockRequest = new Request('http://localhost:3000/api/portfolio/positions?accountId=test_account_123');
    
    const response = await GET(mockRequest);
    
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.positions).toBeDefined();
    expect(responseData.positions[0].symbol).toBe('AAPL');
    
    // Verify the backend was called with JWT token
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/portfolio/test_account_123/positions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock_jwt_token_here',
          'X-API-KEY': 'test_api_key_123'
        })
      })
    );
  });

  test('should return 401 when JWT authentication fails', async () => {
    // Mock authentication failure
    const { authenticateWithJWT } = require('@/utils/api/secure-backend-helpers');
    authenticateWithJWT.mockRejectedValueOnce(new Error('Authentication failed'));

    const { GET } = require('../../app/api/portfolio/positions/route');
    const mockRequest = new Request('http://localhost:3000/api/portfolio/positions?accountId=test_account_123');
    
    const response = await GET(mockRequest);
    
    expect(response.status).toBe(401);
    
    const responseData = await response.json();
    expect(responseData.error).toContain('Authentication');
  });

  test('should return 400 when accountId is missing', async () => {
    const { GET } = require('../../app/api/portfolio/positions/route');
    const mockRequest = new Request('http://localhost:3000/api/portfolio/positions'); // No accountId
    
    const response = await GET(mockRequest);
    
    expect(response.status).toBe(400);
    
    const responseData = await response.json();
    expect(responseData.error).toContain('Account ID is required');
  });

  test('should return 403 when user does not own the account', async () => {
    // Mock account ownership failure
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'Account not found' }
    });

    const { GET } = require('../../app/api/portfolio/positions/route');
    const mockRequest = new Request('http://localhost:3000/api/portfolio/positions?accountId=wrong_account');
    
    const response = await GET(mockRequest);
    
    expect(response.status).toBe(403);
    
    const responseData = await response.json();
    expect(responseData.error).toContain('access denied');
  });
});