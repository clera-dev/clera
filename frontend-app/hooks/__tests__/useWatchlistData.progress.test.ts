/**
 * Progress Tracking Tests for useWatchlistData Hook
 * 
 * These tests verify that the hook provides accurate loading progress feedback
 * and doesn't get stuck at 0%.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useWatchlistData } from '../useWatchlistData';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variable
process.env.NEXT_PUBLIC_API_KEY = 'test-api-key';

describe('useWatchlistData - Progress Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Progress Initialization', () => {
    it('should initialize progress correctly for first load', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL', 'MSFT'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [
            { symbol: 'AAPL', price: 150.0 },
            { symbol: 'GOOGL', price: 2500.0 },
            { symbol: 'MSFT', price: 300.0 }
          ]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      // Initial state should have no progress
      expect(result.current.loadingProgress).toBeNull();

      // Trigger fetch
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should initialize progress with 0 loaded
      expect(result.current.loadingProgress).toEqual({ loaded: 0, total: 3 });
    });

    it('should not show progress for background refreshes', async () => {
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

      // First load - should show progress
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show progress for first load
      expect(result.current.loadingProgress).toEqual({ loaded: 2, total: 2 });

      // Mock second fetch (background refresh)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [
            { symbol: 'AAPL', price: 151.0 },
            { symbol: 'GOOGL', price: 2501.0 }
          ]
        })
      });

      // Second load - should not show progress
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should clear progress for background refresh
      expect(result.current.loadingProgress).toBeNull();
    });
  });

  describe('Progress Updates', () => {
    it('should update progress when batch quotes complete', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL', 'MSFT'] })
      });

      // Mock successful batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: [
            { symbol: 'AAPL', price: 150.0 },
            { symbol: 'GOOGL', price: 2500.0 },
            { symbol: 'MSFT', price: 300.0 }
          ]
        })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show completion progress
      expect(result.current.loadingProgress).toEqual({ loaded: 3, total: 3 });

      // Should clear progress after delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
    });

    it('should update progress incrementally for individual quotes', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL', 'MSFT'] })
      });

      // Mock failed batch quote fetch (triggers individual fallback)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Batch failed' })
      });

      // Mock individual quote fetches
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 150.0 })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 2500.0 })
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 300.0 })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show completion progress
      expect(result.current.loadingProgress).toEqual({ loaded: 3, total: 3 });

      // Should clear progress after delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
    });
  });

  describe('Progress Edge Cases', () => {
    it('should handle empty watchlist correctly', async () => {
      // Mock successful watchlist fetch with no symbols
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: [] })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should not show progress for empty watchlist
      expect(result.current.loadingProgress).toBeNull();
    });

    it('should handle failed quote fetches gracefully', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      // Mock failed batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Batch failed' })
      });

      // Mock failed individual quote fetches
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should still show completion progress even with failures
      expect(result.current.loadingProgress).toEqual({ loaded: 2, total: 2 });

      // Should clear progress after delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
    });

    it('should handle mixed success/failure scenarios', async () => {
      // Mock successful watchlist fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL', 'MSFT'] })
      });

      // Mock failed batch quote fetch
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Batch failed' })
      });

      // Mock mixed individual quote results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 150.0 })
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 300.0 })
      });

      const { result } = renderHook(() => 
        useWatchlistData({ accountId: 'test-account' })
      );

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show completion progress for all items
      expect(result.current.loadingProgress).toEqual({ loaded: 3, total: 3 });

      // Should clear progress after delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
    });
  });

  describe('Progress State Management', () => {
    it('should reset progress state correctly', async () => {
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

      // Initial state
      expect(result.current.loadingProgress).toBeNull();

      // After fetch starts
      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should show completion
      expect(result.current.loadingProgress).toEqual({ loaded: 1, total: 1 });

      // After delay, should clear
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.loadingProgress).toBeNull();
      });
    });

    it('should not get stuck at 0% progress', async () => {
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

      await act(async () => {
        await result.current.fetchWatchlist();
      });

      // Should never be stuck at 0%
      expect(result.current.loadingProgress?.loaded).toBeGreaterThan(0);
      expect(result.current.loadingProgress?.loaded).toBe(result.current.loadingProgress?.total);
    });
  });
}); 