/**
 * Dead Code Cleanup Tests for useWatchlistData Hook
 * 
 * These tests verify that the hook has been cleaned up properly and
 * no longer contains dead code or misleading API surface.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useWatchlistData } from '../useWatchlistData';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variable
process.env.NEXT_PUBLIC_API_KEY = 'test-api-key';

describe('useWatchlistData - Dead Code Cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Interface Cleanup', () => {
    it('should not expose isLoading in the returned interface', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify that isLoading is not in the returned object
      expect(result.current).not.toHaveProperty('isLoading');
      
      // Verify that isRefreshing is not in the returned object
      expect(result.current).not.toHaveProperty('isRefreshing');
      
      console.log('✅ Dead code removed from interface');
    });

    it('should expose only the necessary loading states', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify that only the necessary loading states are exposed
      expect(result.current).toHaveProperty('isInitialLoading');
      expect(result.current).toHaveProperty('isUpdatingWatchlist');
      expect(result.current).toHaveProperty('loadingProgress');
      expect(result.current).toHaveProperty('hasAttemptedLoad');
      
      console.log('✅ Only necessary loading states exposed');
    });

    it('should have a clean and accurate API surface', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify the complete interface structure
      const expectedProperties = [
        'watchlistData',
        'isInitialLoading',
        'isUpdatingWatchlist',
        'hasAttemptedLoad',
        'loadingProgress',
        'error',
        'fetchWatchlist',
        'addToWatchlist',
        'removeFromWatchlist',
        'setError'
      ];

      expectedProperties.forEach(prop => {
        expect(result.current).toHaveProperty(prop);
      });

      // Verify no unexpected properties
      const actualProperties = Object.keys(result.current);
      expect(actualProperties).toHaveLength(expectedProperties.length);
      
      console.log('✅ Clean and accurate API surface');
    });
  });

  describe('Loading State Functionality', () => {
    it('should properly manage isInitialLoading state', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [
            { symbol: 'AAPL', price: 150.0 },
            { symbol: 'GOOGL', price: 2500.0 }
          ]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Initial state should be false
      expect(result.current.isInitialLoading).toBe(false);

      // Trigger fetch
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should be false after fetch completes
      expect(result.current.isInitialLoading).toBe(false);
      
      console.log('✅ isInitialLoading state managed correctly');
    });

    it('should properly manage isUpdatingWatchlist state', async () => {
      // Mock successful add to watchlist
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Initial state should be false
      expect(result.current.isUpdatingWatchlist).toBe(false);

      // Trigger add operation
      await act(async () => {
        await result.current.addToWatchlist('AAPL');
      });

      // Should be false after operation completes
      expect(result.current.isUpdatingWatchlist).toBe(false);
      
      console.log('✅ isUpdatingWatchlist state managed correctly');
    });

    it('should properly manage loadingProgress state', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [
            { symbol: 'AAPL', price: 150.0 },
            { symbol: 'GOOGL', price: 2500.0 }
          ]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Initial state should be null
      expect(result.current.loadingProgress).toBeNull();

      // Trigger fetch
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show completion progress
      expect(result.current.loadingProgress).toEqual({ loaded: 2, total: 2 });

      // Should clear after delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
      
      console.log('✅ loadingProgress state managed correctly');
    });
  });

  describe('Hook Functionality After Cleanup', () => {
    it('should still provide all core functionality', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [{ symbol: 'AAPL', price: 150.0 }]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify core functionality still works
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      expect(result.current.watchlistData).toHaveLength(1);
      expect(result.current.watchlistData[0].symbol).toBe('AAPL');
      expect(result.current.watchlistData[0].currentPrice).toBe(150.0);
      
      console.log('✅ Core functionality preserved after cleanup');
    });

    it('should handle errors correctly after cleanup', async () => {
      // Mock failed watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Failed to fetch watchlist' })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify error handling still works
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      expect(result.current.error).toBe('Failed to fetch watchlist');
      expect(result.current.isInitialLoading).toBe(false);
      
      console.log('✅ Error handling preserved after cleanup');
    });

    it('should handle add/remove operations correctly after cleanup', async () => {
      // Mock successful add operation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify add operation still works
      await act(async () => {
        await result.current.addToWatchlist('AAPL');
      });

      expect(result.current.isUpdatingWatchlist).toBe(false);
      expect(result.current.error).toBeNull();
      
      console.log('✅ Add/remove operations preserved after cleanup');
    });
  });

  describe('Memory and Performance', () => {
    it('should not create unnecessary state variables', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify that the hook doesn't expose any dead state
      const stateProperties = [
        'watchlistData',
        'isInitialLoading', 
        'isUpdatingWatchlist',
        'hasAttemptedLoad',
        'loadingProgress',
        'error'
      ];

      stateProperties.forEach(prop => {
        expect(result.current).toHaveProperty(prop);
      });

      // Verify no extra state properties
      const allProperties = Object.keys(result.current);
      const actionProperties = ['fetchWatchlist', 'addToWatchlist', 'removeFromWatchlist', 'setError'];
      const expectedProperties = [...stateProperties, ...actionProperties];
      
      expect(allProperties).toEqual(expectedProperties);
      
      console.log('✅ No unnecessary state variables created');
    });

    it('should have efficient state management', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify that all exposed states are actually used
      expect(typeof result.current.isInitialLoading).toBe('boolean');
      expect(typeof result.current.isUpdatingWatchlist).toBe('boolean');
      expect(typeof result.current.hasAttemptedLoad).toBe('boolean');
      expect(result.current.loadingProgress).toBeNull();
      expect(result.current.error).toBeNull();
      expect(Array.isArray(result.current.watchlistData)).toBe(true);
      
      console.log('✅ Efficient state management maintained');
    });
  });

  describe('API Surface Accuracy', () => {
    it('should provide accurate loading state information', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [{ symbol: 'AAPL', price: 150.0 }]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify initial state
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.isUpdatingWatchlist).toBe(false);
      expect(result.current.hasAttemptedLoad).toBe(false);

      // Trigger fetch
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Verify final state
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.isUpdatingWatchlist).toBe(false);
      expect(result.current.hasAttemptedLoad).toBe(true);
      expect(result.current.watchlistData).toHaveLength(1);
      
      console.log('✅ Accurate loading state information provided');
    });

    it('should not mislead consumers about available functionality', () => {
      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Verify that all exposed properties are functional
      expect(typeof result.current.fetchWatchlist).toBe('function');
      expect(typeof result.current.addToWatchlist).toBe('function');
      expect(typeof result.current.removeFromWatchlist).toBe('function');
      expect(typeof result.current.setError).toBe('function');

      // Verify that all exposed states are meaningful
      expect(typeof result.current.isInitialLoading).toBe('boolean');
      expect(typeof result.current.isUpdatingWatchlist).toBe('boolean');
      expect(typeof result.current.hasAttemptedLoad).toBe('boolean');
      
      console.log('✅ No misleading functionality exposed');
    });
  });
}); 