/**
 * Architectural Tests for useMarketPercentages Hook
 * 
 * These tests verify that the hook properly respects the MarketDataService
 * singleton pattern and doesn't interfere with shared caching.
 */

import { renderHook, act } from '@testing-library/react';
import { useMarketPercentages } from '../useMarketPercentages';
import { MarketDataService } from '@/utils/services/MarketDataService';

// Mock the MarketDataService
jest.mock('@/utils/services/MarketDataService', () => {
  const mockCache = new Map();
  const mockInstance = {
    calculateChartBasedPercentage: jest.fn(),
    clearCache: jest.fn(() => mockCache.clear()),
    invalidateSymbol: jest.fn((symbol: string) => mockCache.delete(symbol)),
    getCacheStats: jest.fn(() => ({ size: mockCache.size, entries: Array.from(mockCache.keys()) })),
  };

  return {
    MarketDataService: {
      getInstance: jest.fn(() => mockInstance),
    },
  };
});

describe('useMarketPercentages - Architectural Patterns', () => {
  let mockMarketDataService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarketDataService = MarketDataService.getInstance();
  });

  describe('Singleton Pattern Respect', () => {
    it('should use singleton instance without clearing cache by default', () => {
      const { result } = renderHook(() => useMarketPercentages(['AAPL', 'GOOGL']));

      // Verify getInstance was called without the clearCache parameter
      expect(MarketDataService.getInstance).toHaveBeenCalledWith();
      expect(MarketDataService.getInstance).not.toHaveBeenCalledWith(true);
    });

    it('should call getInstance only once per hook instance', () => {
      const { result, rerender } = renderHook(() => useMarketPercentages(['AAPL']));

      // Re-render the hook
      rerender();

      // getInstance should only be called once (in useMemo)
      expect(MarketDataService.getInstance).toHaveBeenCalledTimes(1);
    });

    it('should share the same service instance across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useMarketPercentages(['AAPL']));
      const { result: result2 } = renderHook(() => useMarketPercentages(['GOOGL']));

      // Both hooks should use the same service instance
      expect(MarketDataService.getInstance).toHaveBeenCalledTimes(2);
      expect(MarketDataService.getInstance).toHaveBeenNthCalledWith(1);
      expect(MarketDataService.getInstance).toHaveBeenNthCalledWith(2);
    });
  });

  describe('Cache Behavior', () => {
    it('should not clear cache on mount by default', () => {
      renderHook(() => useMarketPercentages(['AAPL']));

      // Cache should not be cleared
      expect(mockMarketDataService.clearCache).not.toHaveBeenCalled();
    });

    it('should clear cache only when forceRefresh option is provided', () => {
      renderHook(() => useMarketPercentages(['AAPL'], { forceRefresh: true }));

      // Cache should be cleared when forceRefresh is true
      expect(mockMarketDataService.clearCache).toHaveBeenCalledTimes(1);
    });

    it('should clear cache only once per forceRefresh cycle', () => {
      const { result, rerender } = renderHook(
        ({ symbols, options }) => useMarketPercentages(symbols, options),
        { initialProps: { symbols: ['AAPL'], options: { forceRefresh: true } } }
      );

      // Re-render with same forceRefresh value
      rerender({ symbols: ['AAPL'], options: { forceRefresh: true } });

      // Cache should only be cleared once
      expect(mockMarketDataService.clearCache).toHaveBeenCalledTimes(1);
    });

    it('should reset forceRefresh flag when symbols change', () => {
      const { result, rerender } = renderHook(
        ({ symbols, options }) => useMarketPercentages(symbols, options),
        { initialProps: { symbols: ['AAPL'], options: { forceRefresh: true } } }
      );

      // Change symbols
      rerender({ symbols: ['GOOGL'], options: { forceRefresh: true } });

      // Cache should be cleared twice (once for each symbol change)
      expect(mockMarketDataService.clearCache).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cross-Component Interference Prevention', () => {
    it('should not interfere with other components using the same service', () => {
      // Simulate multiple components using the service
      const { result: hook1 } = renderHook(() => useMarketPercentages(['AAPL']));
      const { result: hook2 } = renderHook(() => useMarketPercentages(['GOOGL']));

      // Neither hook should clear the cache
      expect(mockMarketDataService.clearCache).not.toHaveBeenCalled();

      // Both hooks should be able to calculate percentages independently
      act(() => {
        // Trigger calculations
        hook1.result.current.percentages;
        hook2.result.current.percentages;
      });

      // Service methods should be called for both hooks
      expect(mockMarketDataService.calculateChartBasedPercentage).toHaveBeenCalledWith('AAPL');
      expect(mockMarketDataService.calculateChartBasedPercentage).toHaveBeenCalledWith('GOOGL');
    });

    it('should maintain separate state for different hook instances', () => {
      const { result: hook1 } = renderHook(() => useMarketPercentages(['AAPL']));
      const { result: hook2 } = renderHook(() => useMarketPercentages(['GOOGL']));

      // Each hook should have its own state
      expect(hook1.result.current.percentages).toBeInstanceOf(Map);
      expect(hook2.result.current.percentages).toBeInstanceOf(Map);
      expect(hook1.result.current.percentages).not.toBe(hook2.result.current.percentages);
    });
  });

  describe('Performance Optimization', () => {
    it('should memoize the service instance', () => {
      const { result, rerender } = renderHook(() => useMarketPercentages(['AAPL']));

      // Re-render multiple times
      rerender();
      rerender();
      rerender();

      // getInstance should only be called once due to useMemo
      expect(MarketDataService.getInstance).toHaveBeenCalledTimes(1);
    });

    it('should not recreate service instance on symbol changes', () => {
      const { result, rerender } = renderHook(
        ({ symbols }) => useMarketPercentages(symbols),
        { initialProps: { symbols: ['AAPL'] } }
      );

      // Change symbols
      rerender({ symbols: ['GOOGL'] });
      rerender({ symbols: ['MSFT'] });

      // getInstance should still only be called once
      expect(MarketDataService.getInstance).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully without breaking singleton pattern', () => {
      // Mock service to throw an error
      mockMarketDataService.calculateChartBasedPercentage.mockRejectedValueOnce(
        new Error('API Error')
      );

      const { result } = renderHook(() => useMarketPercentages(['AAPL']));

      // Hook should still use the same service instance
      expect(MarketDataService.getInstance).toHaveBeenCalledTimes(1);
      expect(MarketDataService.getInstance).toHaveBeenCalledWith();
    });
  });
}); 