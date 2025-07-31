/**
 * @jest-environment node
 */

import { createMocks } from 'node-mocks-http';

// Mock Supabase client before importing the route
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

// Mock validateAndSanitizeSymbols
jest.mock('@/utils/security', () => ({
  validateAndSanitizeSymbols: jest.fn((symbols) => symbols.filter(s => typeof s === 'string' && s.length > 0)),
}));

// Mock fetch globally
global.fetch = jest.fn();

// Now import after mocks are set up
import { POST } from '@/app/api/market/quotes/batch/route';
import { createClient } from '@/utils/supabase/server';

describe('/api/market/quotes/batch', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    process.env.BACKEND_API_URL = 'http://localhost:8000';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.BACKEND_API_URL;
    delete process.env.BACKEND_API_KEY;
  });

  it('should make single request to backend batch endpoint (not N+1)', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user' } },
      error: null,
    });

    const mockBackendResponse = {
      quotes: [
        { symbol: 'AAPL', price: 150.00, changesPercentage: 2.5 },
        { symbol: 'MSFT', price: 300.00, changesPercentage: -1.2 },
      ],
      errors: [],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBackendResponse),
    });

    // Create mock request
    const mockRequest = {
      json: () => Promise.resolve({ symbols: ['AAPL', 'MSFT'] }),
      nextUrl: { pathname: '/api/market/quotes/batch' },
    } as any;

    // Act
    const response = await POST(mockRequest);
    const responseData = await response.json();

    // Assert
    expect(global.fetch).toHaveBeenCalledTimes(1); // CRITICAL: Only ONE call, not N calls
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/market/quotes/batch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': 'test-api-key',
        },
        body: JSON.stringify({
          symbols: ['AAPL', 'MSFT'],
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(responseData).toEqual({
      quotes: mockBackendResponse.quotes,
      errors: [],
    });
  });

  it('should handle backend errors gracefully', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user' } },
      error: null,
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const mockRequest = {
      json: () => Promise.resolve({ symbols: ['AAPL'] }),
      nextUrl: { pathname: '/api/market/quotes/batch' },
    } as any;

    // Act
    const response = await POST(mockRequest);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(502);
    expect(responseData.error).toBe('Failed to fetch quotes from backend service.');
  });

  it('should reject unauthenticated requests', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('No user'),
    });

    const mockRequest = {
      json: () => Promise.resolve({ symbols: ['AAPL'] }),
      nextUrl: { pathname: '/api/market/quotes/batch' },
    } as any;

    // Act
    const response = await POST(mockRequest);

    // Assert
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled(); // Should not reach backend
  });

  it('should validate symbols input', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user' } },
      error: null,
    });

    const mockRequest = {
      json: () => Promise.resolve({ symbols: [] }),
      nextUrl: { pathname: '/api/market/quotes/batch' },
    } as any;

    // Act
    const response = await POST(mockRequest);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(responseData.error).toBe('Symbols array is required');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should enforce batch size limit', async () => {
    // Arrange
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user' } },
      error: null,
    });

    const tooManySymbols = Array.from({ length: 51 }, (_, i) => `SYM${i}`);
    const mockRequest = {
      json: () => Promise.resolve({ symbols: tooManySymbols }),
      nextUrl: { pathname: '/api/market/quotes/batch' },
    } as any;

    // Act
    const response = await POST(mockRequest);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(responseData.error).toBe('Maximum 50 symbols allowed per batch');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});