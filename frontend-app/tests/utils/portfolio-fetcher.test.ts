// Mock server-only module for testing
jest.mock('server-only', () => ({}));

import { fetchPortfolioPositions, formatPortfolioString } from '@/utils/services/portfolio-fetcher';

// Mock fetch globally
global.fetch = jest.fn();

describe('Portfolio Fetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set required environment variables for testing
    process.env.BACKEND_API_URL = 'http://localhost:8000';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  describe('fetchPortfolioPositions', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    
    it('should handle successful response correctly', async () => {
      const mockPositions = [
        { symbol: 'AAPL', qty: '100' },
        { symbol: 'GOOGL', qty: '50' }
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockPositions
      });

      const result = await fetchPortfolioPositions(validUuid, { timeoutMs: 5000 });
      
      expect(result).toEqual(mockPositions);
    });

    it('should handle failed response correctly', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await fetchPortfolioPositions(validUuid);
      
      expect(result).toBeNull();
    });

    it('should handle network errors correctly', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await fetchPortfolioPositions(validUuid);
      
      expect(result).toBeNull();
    });

    it('should accept timeout configuration', async () => {
      // Test that the function accepts timeoutMs option
      const options = { timeoutMs: 15000 };
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => []
      });

      const result = await fetchPortfolioPositions(validUuid, options);
      
      expect(result).toEqual([]);
    });

    it('should reject invalid UUID format', async () => {
      const result = await fetchPortfolioPositions('invalid-account-id');
      
      expect(result).toBeNull();
    });

    it('should reject empty account ID', async () => {
      const result = await fetchPortfolioPositions('');
      
      expect(result).toBeNull();
    });
  });

  describe('formatPortfolioString', () => {
    it('should format portfolio positions correctly', () => {
      const positions = [
        { symbol: 'AAPL', qty: '100' },
        { symbol: 'GOOGL', qty: '50' }
      ];
      
      const result = formatPortfolioString(positions);
      expect(result).toBe('AAPL (100 shares), GOOGL (50 shares)');
    });

    it('should handle empty positions', () => {
      const result = formatPortfolioString([]);
      expect(result).toBe('');
    });

    it('should handle null/undefined positions', () => {
      expect(formatPortfolioString(null as any)).toBe('');
      expect(formatPortfolioString(undefined as any)).toBe('');
    });
  });
});
