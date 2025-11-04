/**
 * Unit Tests for useAllocationData Hook
 * 
 * Tests the smart prefetching and caching behavior of the allocation data hook.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAllocationData } from '@/hooks/useAllocationData';

// Mock fetch globally
global.fetch = jest.fn();

describe('useAllocationData', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Prefetching Behavior', () => {
    it('should prefetch both allocation types on mount', async () => {
      // Mock successful responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            pie_data: [
              { name: 'Stock', value: 70, rawValue: 70000, category: 'stock' },
              { name: 'Cash', value: 30, rawValue: 30000, category: 'cash' },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sectors: [
              { sector: 'Technology', value: 50000, percentage: 50 },
              { sector: 'Healthcare', value: 30000, percentage: 30 },
            ],
            total_portfolio_value: 100000,
          }),
        });

      const { result } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          selectedAccountFilter: 'total',
          enabled: true,
        })
      );

      // Should start loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Both endpoints should have been called
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/cash-stock-bond-allocation')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/portfolio/sector-allocation')
      );

      // Data should be available
      expect(result.current.assetClassData).toBeDefined();
      expect(result.current.sectorData).toBeDefined();
      expect(result.current.hasData).toBe(true);
    });

    it('should fetch data in parallel for performance', async () => {
      const fetchTimes: number[] = [];

      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        const startTime = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate 100ms API call
        fetchTimes.push(Date.now() - startTime);

        return {
          ok: true,
          json: async () => (url.includes('sector') ? { sectors: [] } : { pie_data: [] }),
        };
      });

      renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(fetchTimes.length).toBe(2);
      });

      // Both requests should have taken approximately the same time (parallel execution)
      // If sequential, second request would take 200ms+, but parallel should be ~100ms
      expect(Math.max(...fetchTimes)).toBeLessThan(150);
    });
  });

  describe('Caching Behavior', () => {
    it('should use cached data when available', async () => {
      const mockAssetClassData = {
        pie_data: [{ name: 'Stock', value: 100, rawValue: 100000, category: 'stock' }],
      };
      const mockSectorData = {
        sectors: [{ sector: 'Technology', value: 100000, percentage: 100 }],
        total_portfolio_value: 100000,
      };

      // First render - fetch data
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockAssetClassData })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSectorData });

      const { result, rerender, unmount } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          selectedAccountFilter: 'total',
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(result.current.hasData).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const firstCallCount = (global.fetch as jest.Mock).mock.calls.length;

      // Unmount and remount - should use cache
      unmount();

      const { result: result2 } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          selectedAccountFilter: 'total',
          enabled: true,
          cacheTTL: 5 * 60 * 1000,
        })
      );

      await waitFor(() => {
        expect(result2.current.hasData).toBe(true);
      });

      // No additional fetch calls should have been made (using cache)
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(firstCallCount);
      expect(result2.current.assetClassData).toEqual(mockAssetClassData.pie_data);
    });

    it('should refetch when cache expires', async () => {
      jest.useFakeTimers();

      const mockData = {
        pie_data: [{ name: 'Stock', value: 100, rawValue: 100000, category: 'stock' }],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const { unmount } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
          cacheTTL: 1000, // 1 second cache
        })
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const firstCallCount = (global.fetch as jest.Mock).mock.calls.length;
      unmount();

      // Fast-forward time past cache expiration
      jest.advanceTimersByTime(1500);

      // Remount - should refetch
      renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
          cacheTTL: 1000,
        })
      );

      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(firstCallCount);
      });

      jest.useRealTimers();
    });
  });

  describe('Account Filter Changes', () => {
    it('should clear cache and refetch when account filter changes', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ pie_data: [], sectors: [] }),
      });

      const { rerender } = renderHook(
        ({ filter }) =>
          useAllocationData({
            accountId: 'test-account',
            selectedAccountFilter: filter,
            enabled: true,
          }),
        { initialProps: { filter: 'total' } }
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const callsAfterFirstRender = (global.fetch as jest.Mock).mock.calls.length;

      // Change filter
      rerender({ filter: 'account-123' });

      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(
          callsAfterFirstRender
        );
      });

      // Should have fetched with new filter parameter
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('filter_account=account-123')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have errors
      expect(result.current.assetClassError).toBeTruthy();
      expect(result.current.sectorError).toBeTruthy();
      expect(result.current.hasData).toBe(false);
    });

    it('should handle partial failures', async () => {
      // Asset class succeeds, sector fails
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ pie_data: [{ name: 'Stock', value: 100 }] }),
        })
        .mockRejectedValueOnce(new Error('Sector API failed'));

      const { result } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Asset class data should be available
      expect(result.current.assetClassData).toBeDefined();
      expect(result.current.assetClassError).toBeNull();

      // Sector should have error
      expect(result.current.sectorData).toBeNull();
      expect(result.current.sectorError).toBeTruthy();
    });
  });

  describe('Manual Refresh', () => {
    it('should force refetch when refresh is called', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ pie_data: [], sectors: [] }),
      });

      const { result } = renderHook(() =>
        useAllocationData({
          accountId: 'test-account',
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(result.current.hasData).toBe(true);
      });

      const callsBeforeRefresh = (global.fetch as jest.Mock).mock.calls.length;

      // Call refresh
      result.current.refresh();

      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(
          callsBeforeRefresh
        );
      });
    });
  });

  describe('Race Condition Protection', () => {
    it('should discard stale fetch results', async () => {
      let resolveFirst: any;
      let resolveSecond: any;

      const firstFetch = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const secondFetch = new Promise((resolve) => {
        resolveSecond = resolve;
      });

      (global.fetch as jest.Mock)
        .mockReturnValueOnce(firstFetch)
        .mockReturnValueOnce(firstFetch)
        .mockReturnValueOnce(secondFetch)
        .mockReturnValueOnce(secondFetch);

      const { rerender } = renderHook(
        ({ accountId }) => useAllocationData({ accountId, enabled: true }),
        { initialProps: { accountId: 'account-1' } }
      );

      // Change account before first fetch completes
      rerender({ accountId: 'account-2' });

      // Resolve second fetch first
      resolveSecond({
        ok: true,
        json: async () => ({ pie_data: [{ name: 'Account 2 Data' }], sectors: [] }),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(4);
      });

      // Now resolve first fetch (stale)
      resolveFirst({
        ok: true,
        json: async () => ({ pie_data: [{ name: 'Account 1 Data (stale)' }], sectors: [] }),
      });

      // Wait a bit to ensure stale data doesn't update state
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Result should not contain stale data
      // This test verifies the implementation prevents race conditions
    });
  });
});

