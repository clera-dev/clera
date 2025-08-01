// Mock Next.js server components
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({
      status: options?.status || 200,
      json: async () => data,
      ...options
    }))
  },
  NextRequest: jest.fn().mockImplementation((url, options) => ({
    url,
    method: options?.method || 'GET',
    headers: new Map(Object.entries(options?.headers || {})),
    json: async () => JSON.parse(options?.body || '{}'),
    nextUrl: {
      pathname: new URL(url).pathname
    }
  }))
}));

// Mock Supabase client
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => ({
        data: { user: { id: 'test-user-id' } },
        error: null
      }))
    }
  }))
}));

// Mock fetch
global.fetch = jest.fn();

// Import after mocking
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/market/quotes/batch/route';

describe('Market Quotes Batch API - Security', () => {
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.BACKEND_API_URL = 'https://api.backend.com';
    process.env.BACKEND_API_KEY = 'test-api-key';
    
    // Mock successful backend response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        price: 150.00,
        change: 2.50,
        changesPercentage: 1.67,
        open: 148.00,
        previousClose: 147.50,
        dayHigh: 152.00,
        dayLow: 147.00,
        volume: 1000000,
        timestamp: Date.now(),
        name: 'Apple Inc.',
        marketCap: 2500000000000,
        exchange: 'NASDAQ'
      })
    } as Response);
  });

  const createRequest = (symbols: string[]) => {
    return new NextRequest('http://localhost:3000/api/market/quotes/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbols })
    });
  };

  describe('Input Validation and Sanitization', () => {
    it('should accept valid stock symbols', async () => {
      const request = createRequest(['AAPL', 'GOOGL', 'MSFT']);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(3);
      expect(data.quotes[0].symbol).toBe('AAPL');
    });

    it('should sanitize and uppercase symbols', async () => {
      const request = createRequest(['aapl', '  googl  ', 'msft']);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(3);
      expect(data.quotes[0].symbol).toBe('AAPL');
      expect(data.quotes[1].symbol).toBe('GOOGL');
      expect(data.quotes[2].symbol).toBe('MSFT');
    });

    it('should filter out invalid symbols', async () => {
      const request = createRequest(['AAPL', 'INVALID!', 'GOOGL', '123']);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(3); // AAPL, GOOGL, and 123 are all valid
      expect(data.quotes.map((q: any) => q.symbol)).toEqual(['AAPL', 'GOOGL', '123']);
    });

    it('should reject request with no valid symbols', async () => {
      const request = createRequest(['../../../admin', 'file:///etc/passwd', 'javascript:alert("xss")']);
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No valid symbols provided');
    });
  });

  describe('SSRF Attack Prevention', () => {
    it('should prevent directory traversal attacks', async () => {
      const maliciousSymbols = [
        '../../../admin/users',
        '..\\..\\..\\windows\\system32',
        '....//etc/passwd',
        '..%2f..%2f..%2fadmin'
      ];

      for (const symbol of maliciousSymbols) {
        const request = createRequest([symbol]);
        const response = await POST(request);
        
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('No valid symbols provided');
      }
    });

    it('should prevent protocol attacks', async () => {
      const maliciousSymbols = [
        'file:///etc/passwd',
        'http://internal-service.com',
        'ftp://evil.com',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'http://localhost:8080/admin',
        'https://internal-api.company.com'
      ];

      for (const symbol of maliciousSymbols) {
        const request = createRequest([symbol]);
        const response = await POST(request);
        
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('No valid symbols provided');
      }
    });

    it('should prevent path injection attacks', async () => {
      const maliciousSymbols = [
        'api/admin/users',
        'internal/system',
        'debug/logs',
        'config/database',
        'admin/dashboard',
        'auth/tokens'
      ];

      for (const symbol of maliciousSymbols) {
        const request = createRequest([symbol]);
        const response = await POST(request);
        
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('No valid symbols provided');
      }
    });

    it('should prevent overly long symbols', async () => {
      const longSymbol = 'A'.repeat(25); // Longer than 20 characters
      const request = createRequest([longSymbol]);
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No valid symbols provided');
    });

    it('should prevent empty symbols', async () => {
      const request = createRequest(['', '   ', '\t\n']);
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No valid symbols provided');
    });
  });

  describe('URL Encoding Security', () => {
    it('should properly encode symbols in backend requests', async () => {
      const request = createRequest(['AAPL', 'GOOGL']);
      await POST(request);
      
      // Verify that fetch was called with properly encoded URLs
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      const firstCall = mockFetch.mock.calls[0][0] as string;
      const secondCall = mockFetch.mock.calls[1][0] as string;
      
      expect(firstCall).toBe('https://api.backend.com/api/market/quote/AAPL');
      expect(secondCall).toBe('https://api.backend.com/api/market/quote/GOOGL');
    });

    it('should handle symbols with special characters safely', async () => {
      const request = createRequest(['BRK.A', 'BRK-B']); // Valid symbols with dots and hyphens
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(2);
      
      // Verify that fetch was called with properly encoded URLs
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      const firstCall = mockFetch.mock.calls[0][0] as string;
      const secondCall = mockFetch.mock.calls[1][0] as string;
      
      expect(firstCall).toBe('https://api.backend.com/api/market/quote/BRK.A');
      expect(secondCall).toBe('https://api.backend.com/api/market/quote/BRK-B');
    });
  });

  describe('Mixed Valid and Invalid Symbols', () => {
    it('should process valid symbols and filter out invalid ones', async () => {
      const request = createRequest([
        'AAPL',           // Valid
        '../../../admin',  // Invalid - directory traversal
        'GOOGL',          // Valid
        'file:///etc/passwd', // Invalid - protocol attack
        'MSFT',           // Valid
        'INVALID!',       // Invalid - special characters
        'TSLA'            // Valid
      ]);
      
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(4); // Only valid symbols: AAPL, GOOGL, MSFT, TSLA
      
      const symbols = data.quotes.map((q: any) => q.symbol);
      expect(symbols).toEqual(['AAPL', 'GOOGL', 'MSFT', 'TSLA']);
    });

    it('should log security events when symbols are filtered', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const request = createRequest(['AAPL', '../../../admin', 'GOOGL']);
      await POST(request);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Security] 1 invalid symbols filtered out'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined symbols', async () => {
      const request = createRequest([null as any, undefined as any, 'AAPL']);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(1); // Only AAPL should be valid
    });

    it('should handle non-string symbols', async () => {
      const request = createRequest([123 as any, {} as any, 'AAPL', [] as any]);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(1); // Only AAPL should be valid
    });

    it('should handle symbols with whitespace', async () => {
      const request = createRequest(['  AAPL  ', '  GOOGL  ', '  MSFT  ']);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(3);
      expect(data.quotes[0].symbol).toBe('AAPL');
      expect(data.quotes[1].symbol).toBe('GOOGL');
      expect(data.quotes[2].symbol).toBe('MSFT');
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should limit batch size to 50 symbols', async () => {
      const largeBatch = Array.from({ length: 51 }, (_, i) => `SYMBOL${i}`);
      const request = createRequest(largeBatch);
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Maximum 50 symbols allowed per batch');
    });

    it('should allow maximum batch size', async () => {
      const maxBatch = Array.from({ length: 50 }, (_, i) => `SYMBOL${i}`);
      const request = createRequest(maxBatch);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.quotes).toHaveLength(50);
    });
  });
}); 