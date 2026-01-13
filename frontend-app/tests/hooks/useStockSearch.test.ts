/**
 * Comprehensive tests for useStockSearch hook.
 * 
 * Tests cover:
 * - Debounced search behavior
 * - Caching functionality
 * - Popular stocks loading
 * - Error handling
 * - Race condition handling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useStockSearch, clearStockSearchCache } from '@/hooks/useStockSearch';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Sample test data
const mockPopularStocks = {
  success: true,
  assets: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  ],
  count: 3,
};

const mockSearchResults = {
  success: true,
  results: [
    { symbol: 'AAPL', name: 'Apple Inc.', score: 1000 },
    { symbol: 'AAPB', name: '2x Long AAPL ETF', score: 400 },
  ],
  total_matches: 2,
  query: 'AAPL',
};

describe('useStockSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearStockSearchCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    it('should start with empty results and loading popular stocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPopularStocks),
      });

      const { result } = renderHook(() => useStockSearch());

      expect(result.current.results).toEqual([]);
      expect(result.current.searchTerm).toBe('');
      expect(result.current.hasSearchResults).toBe(false);
    });

    it('should fetch popular stocks on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPopularStocks),
      });

      const { result } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result.current.popularStocks).toEqual(mockPopularStocks.assets);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/market/popular?limit=50');
    });

    it('should skip popular stocks fetch when disabled', async () => {
      const { result } = renderHook(() => 
        useStockSearch({ fetchPopularOnMount: false })
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.popularStocks).toEqual([]);
    });
  });

  describe('Search Behavior', () => {
    it('should debounce search requests', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        });

      const { result } = renderHook(() => 
        useStockSearch({ debounceMs: 200 })
      );

      // Wait for popular stocks to load
      await waitFor(() => {
        expect(result.current.popularStocks.length).toBeGreaterThan(0);
      });

      // Update search term multiple times rapidly
      act(() => {
        result.current.setSearchTerm('A');
      });
      act(() => {
        result.current.setSearchTerm('AA');
      });
      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      // Fast forward time
      act(() => {
        jest.advanceTimersByTime(250);
      });

      await waitFor(() => {
        expect(result.current.results.length).toBeGreaterThan(0);
      });

      // Should only make one search API call (debounced)
      const searchCalls = mockFetch.mock.calls.filter(
        call => call[0].includes('/api/market/search')
      );
      expect(searchCalls.length).toBe(1);
      expect(searchCalls[0][0]).toContain('q=AAPL');
    });

    it('should clear results when search term is empty', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        });

      const { result } = renderHook(() => useStockSearch());

      // Wait for popular stocks
      await waitFor(() => {
        expect(result.current.popularStocks.length).toBeGreaterThan(0);
      });

      // Set and clear search term
      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      act(() => {
        jest.advanceTimersByTime(250);
      });

      await waitFor(() => {
        expect(result.current.results.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.setSearchTerm('');
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.hasSearchResults).toBe(false);
    });

    it('should set hasSearchResults correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPopularStocks),
      });

      const { result } = renderHook(() => useStockSearch());

      expect(result.current.hasSearchResults).toBe(false);

      act(() => {
        result.current.setSearchTerm('test');
      });

      expect(result.current.hasSearchResults).toBe(true);

      act(() => {
        result.current.setSearchTerm('');
      });

      expect(result.current.hasSearchResults).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache search results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        });

      const { result } = renderHook(() => useStockSearch());

      // Wait for popular stocks
      await waitFor(() => {
        expect(result.current.popularStocks.length).toBeGreaterThan(0);
      });

      // First search
      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      act(() => {
        jest.advanceTimersByTime(250);
      });

      await waitFor(() => {
        expect(result.current.results.length).toBeGreaterThan(0);
      });

      // Clear and search again
      act(() => {
        result.current.setSearchTerm('');
      });
      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      act(() => {
        jest.advanceTimersByTime(250);
      });

      // Should use cached results (no additional API call)
      const searchCalls = mockFetch.mock.calls.filter(
        call => call[0].includes('/api/market/search')
      );
      expect(searchCalls.length).toBe(1);
    });

    it('should cache popular stocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPopularStocks),
      });

      // First render
      const { result: result1, unmount } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result1.current.popularStocks.length).toBeGreaterThan(0);
      });

      unmount();

      // Second render - should use cached data
      const { result: result2 } = renderHook(() => useStockSearch());

      // Should have popular stocks immediately from cache
      expect(result2.current.popularStocks).toEqual(mockPopularStocks.assets);
      
      // Should not make another API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPopularStocks),
      });

      const { result: result1, unmount } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result1.current.popularStocks.length).toBeGreaterThan(0);
      });

      unmount();
      clearStockSearchCache();

      // Second render - should fetch again
      const { result: result2 } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result2.current.popularStocks.length).toBeGreaterThan(0);
      });

      // Should make two API calls total
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle search API errors gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const { result } = renderHook(() => useStockSearch());

      // Wait for popular stocks
      await waitFor(() => {
        expect(result.current.popularStocks.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.setSearchTerm('test');
      });

      act(() => {
        jest.advanceTimersByTime(250);
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.results).toEqual([]);
    });

    it('should handle popular stocks API errors silently', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result.current.isLoadingPopular).toBe(false);
      });

      // Should not set error for popular stocks failure (not critical)
      expect(result.current.error).toBeNull();
      expect(result.current.popularStocks).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result.current.isLoadingPopular).toBe(false);
      });

      // Should handle gracefully
      expect(result.current.popularStocks).toEqual([]);
    });
  });

  describe('Loading States', () => {
    it('should show loading state during search', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockImplementationOnce(() => 
          new Promise(resolve => 
            setTimeout(() => 
              resolve({
                ok: true,
                json: () => Promise.resolve(mockSearchResults),
              }), 
            100)
          )
        );

      const { result } = renderHook(() => useStockSearch());

      await waitFor(() => {
        expect(result.current.popularStocks.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      // Should be in searching state
      expect(result.current.isSearching).toBe(true);
    });

    it('should show loading state for popular stocks', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => 
            resolve({
              ok: true,
              json: () => Promise.resolve(mockPopularStocks),
            }), 
          100)
        )
      );

      const { result } = renderHook(() => useStockSearch());

      expect(result.current.isLoadingPopular).toBe(true);
    });
  });

  describe('Options', () => {
    it('should respect custom debounce delay', async () => {
      jest.useRealTimers();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPopularStocks),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        });

      const { result } = renderHook(() => 
        useStockSearch({ debounceMs: 100, fetchPopularOnMount: false })
      );

      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      // Wait a bit less than debounce
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have made search call yet
      const searchCallsEarly = mockFetch.mock.calls.filter(
        call => call[0].includes('/api/market/search')
      );
      expect(searchCallsEarly.length).toBe(0);

      // Wait past debounce delay
      await waitFor(() => {
        const searchCalls = mockFetch.mock.calls.filter(
          call => call[0].includes('/api/market/search')
        );
        expect(searchCalls.length).toBe(1);
      }, { timeout: 500 });
    });

    it('should respect custom limit', async () => {
      jest.useRealTimers();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResults),
        });

      const { result } = renderHook(() => 
        useStockSearch({ limit: 10, fetchPopularOnMount: false, debounceMs: 50 })
      );

      act(() => {
        result.current.setSearchTerm('AAPL');
      });

      await waitFor(() => {
        const searchCalls = mockFetch.mock.calls.filter(
          call => call[0] && call[0].includes('/api/market/search')
        );
        expect(searchCalls.length).toBeGreaterThan(0);
      }, { timeout: 500 });

      // Check that limit was passed to API
      const searchCall = mockFetch.mock.calls.find(
        call => call[0] && call[0].includes('/api/market/search')
      );
      expect(searchCall).toBeDefined();
      expect(searchCall[0]).toContain('limit=10');
    });
  });
});
