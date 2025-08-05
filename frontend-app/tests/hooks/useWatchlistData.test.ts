import { renderHook, act, waitFor } from '@testing-library/react';
import { useWatchlistData } from '../../hooks/useWatchlistData';

// Mock fetch globally
global.fetch = jest.fn();

// Mock AbortController
const mockAbort = jest.fn();
const mockAbortController = {
  signal: {},
  abort: mockAbort,
};

jest.spyOn(global, 'AbortController').mockImplementation(() => mockAbortController as any);

describe('useWatchlistData - Race Condition Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockAbort.mockClear();
  });

  it('should cancel previous requests when new fetchWatchlist is called', async () => {
    const { result } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        // Don't pass watchlistSymbols to prevent auto-fetch
      })
    );

    // Start first request
    act(() => {
      result.current.fetchWatchlist();
    });

    // Start second request immediately (should cancel first)
    act(() => {
      result.current.fetchWatchlist();
    });

    // Verify AbortController was created and abort was called
    expect(global.AbortController).toHaveBeenCalledTimes(2);
    expect(mockAbort).toHaveBeenCalledTimes(1);
  });

  it('should ignore responses from cancelled requests', async () => {
    let resolveFirstRequest: (value: any) => void;
    let resolveSecondRequest: (value: any) => void;

    const firstRequestPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve;
    });

    const secondRequestPromise = new Promise((resolve) => {
      resolveSecondRequest = resolve;
    });

    let requestCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url) => {
      requestCount++;
      if (requestCount === 1) {
        return firstRequestPromise;
      } else {
        return secondRequestPromise;
      }
    });

    const { result } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        // Don't pass watchlistSymbols to prevent auto-fetch
      })
    );

    // Start first request
    act(() => {
      result.current.fetchWatchlist();
    });

    // Start second request immediately
    act(() => {
      result.current.fetchWatchlist();
    });

    // Resolve first request (should be ignored)
    act(() => {
      resolveFirstRequest!({
        ok: true,
        json: () => Promise.resolve({ symbols: ['AAPL'] }),
      });
    });

    // Resolve second request (should be processed)
    act(() => {
      resolveSecondRequest!({
        ok: true,
        json: () => Promise.resolve({ symbols: ['GOOGL'] }),
      });
    });

    await waitFor(() => {
      expect(result.current.watchlistData).toHaveLength(1);
      expect(result.current.watchlistData[0].symbol).toBe('GOOGL');
    });
  });

  it('should handle AbortError gracefully without setting error state', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('AbortError'));

    const { result } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        // Don't pass watchlistSymbols to prevent auto-fetch
      })
    );

    act(() => {
      result.current.fetchWatchlist();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it('should clean up abort controller on unmount', async () => {
    // Mock a slow request that won't resolve immediately
    (global.fetch as jest.Mock).mockImplementation(() => 
      new Promise(() => {}) // Never resolves
    );

    const { result, unmount } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        watchlistSymbols: new Set(['AAPL']), // Provide watchlistSymbols to trigger useEffect
      })
    );

    // Wait a bit to ensure the request is in flight
    await new Promise(resolve => setTimeout(resolve, 10));

    // Unmount should abort any pending requests
    unmount();

    expect(mockAbort).toHaveBeenCalled();
  });

  it('should handle successful batch API response with race condition protection', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ symbols: ['AAPL', 'GOOGL'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          quotes: [
            { symbol: 'AAPL', price: 150.0 },
            { symbol: 'GOOGL', price: 2500.0 }
          ] 
        }),
      });

    const { result } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        // Don't pass watchlistSymbols to prevent auto-fetch
      })
    );

    act(() => {
      result.current.fetchWatchlist();
    });

    await waitFor(() => {
      expect(result.current.watchlistData).toHaveLength(2);
      expect(result.current.watchlistData[0].currentPrice).toBe(150.0);
      expect(result.current.watchlistData[1].currentPrice).toBe(2500.0);
    });
  });

  it('should handle individual quote fallback with race condition protection', async () => {
    // Mock batch API to fail, triggering individual fallback
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ symbols: ['AAPL', 'GOOGL'] }),
      })
      .mockRejectedValueOnce(new Error('Batch API failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ price: 150.0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ price: 2500.0 }),
      });

    const { result } = renderHook(() =>
      useWatchlistData({
        accountId: 'test-account',
        // Don't pass watchlistSymbols to prevent auto-fetch
      })
    );

    act(() => {
      result.current.fetchWatchlist();
    });

    await waitFor(() => {
      expect(result.current.watchlistData).toHaveLength(2);
      expect(result.current.watchlistData[0].currentPrice).toBe(150.0);
      expect(result.current.watchlistData[1].currentPrice).toBe(2500.0);
    });
  });
}); 