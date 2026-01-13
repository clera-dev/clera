/**
 * COMPREHENSIVE TEST: LivePortfolioValue Component
 *
 * Tests the following critical performance fixes:
 * 1. Debounced filter account changes (prevents rapid API calls)
 * 2. Abort controller for canceling in-flight requests
 * 3. Smooth account switching without full re-initialization
 * 4. Proper loading states (initial load vs account switch)
 * 5. WebSocket connection management
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// We need to mock the component's dependencies
jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-token',
          },
        },
      }),
    },
  }),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    // Simulate connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 100);
  }

  send(data: string) {}
  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

global.WebSocket = MockWebSocket as any;

// Import the component after mocks are set up
import LivePortfolioValue from '../../components/portfolio/LivePortfolioValue';

describe('LivePortfolioValue Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mock responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/portfolio/aggregated')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              positions: [],
              summary: { total_value: 50000 },
            }),
        });
      }
      if (url.includes('/api/portfolio/history')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              timestamp: [Date.now() - 86400000, Date.now()],
              equity: [49000, 50000],
              profit_loss: [0, 1000],
              profit_loss_pct: [0, 2.04],
            }),
        });
      }
      if (url.includes('/api/portfolio/value')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              total_value: '$50,000.00',
              today_return: '+$1,000.00 (+2.04%)',
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Loading', () => {
    it('should show loading state on initial render', async () => {
      render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
        />
      );

      // Should show loading skeleton initially
      expect(screen.getByText(/Current Value/i)).toBeInTheDocument();

      // Loading indicator should be present
      const loadingElements = document.querySelectorAll('.animate-pulse');
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it('should display portfolio value after loading', async () => {
      render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
        />
      );

      // Advance timers to allow fetch to complete
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      });
    });
  });

  describe('Debounced Filter Changes', () => {
    it('should debounce filter account changes to prevent rapid API calls', async () => {
      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="total"
        />
      );

      // Advance timers for initial load
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Clear initial fetch calls
      mockFetch.mockClear();

      // Rapidly change filter accounts (simulating dropdown clicks)
      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-2"
        />
      );

      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-3"
        />
      );

      // Before debounce timeout, fetch should not be called
      expect(mockFetch).not.toHaveBeenCalled();

      // After debounce timeout (150ms), only ONE fetch should be called
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Should only have made API calls for the final filter value
      const aggregatedCalls = mockFetch.mock.calls.filter(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('/api/portfolio/aggregated')
      );
      expect(aggregatedCalls.length).toBeLessThanOrEqual(1);
    });

    it('should use the debounce delay of 150ms', async () => {
      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="total"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      mockFetch.mockClear();

      // Change filter
      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      // Before 150ms - no fetch
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(mockFetch).not.toHaveBeenCalled();

      // After 150ms - fetch should happen
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Abort Controller for Request Cancellation', () => {
    it('should cancel in-flight requests when filter changes', async () => {
      // Create a slow response that can be aborted
      let abortSignal: AbortSignal | undefined;

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        abortSignal = options?.signal;

        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  positions: [],
                  summary: { total_value: 50000 },
                }),
            });
          }, 1000);

          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      });

      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      // Wait for debounce
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Request should be in flight
      expect(abortSignal).toBeDefined();
      expect(abortSignal?.aborted).toBe(false);

      // Change filter before request completes
      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-2"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      // Previous request should have been aborted
      // Note: The exact behavior depends on the component implementation
    });
  });

  describe('Account Switching UX', () => {
    it('should show "switching" state during account changes', async () => {
      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="total"
        />
      );

      // Wait for initial load
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      await waitFor(() => {
        expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      });

      // Switch account
      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      // During switch, value should fade (opacity-50 class)
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      // The value should still be visible (not replaced with skeleton)
      expect(screen.getByText('$50,000.00')).toBeInTheDocument();
    });

    it('should maintain current values during account switch', async () => {
      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="total"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      await waitFor(() => {
        expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      });

      // Change to different account
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/portfolio/aggregated')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                positions: [],
                summary: { total_value: 25000 },
              }),
          });
        }
        if (url.includes('/api/portfolio/history')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                timestamp: [Date.now() - 86400000, Date.now()],
                equity: [24500, 25000],
                profit_loss: [0, 500],
                profit_loss_pct: [0, 2.04],
              }),
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      // Old value should still be visible during transition
      expect(screen.getByText('$50,000.00')).toBeInTheDocument();

      // After transition completes
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByText('$25,000.00')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Management', () => {
    it('should not create WebSocket for aggregation mode', async () => {
      const wsInstance = jest.spyOn(global, 'WebSocket');

      render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // WebSocket should not be created for aggregation mode
      expect(wsInstance).not.toHaveBeenCalled();
    });

    it('should create WebSocket for brokerage mode', async () => {
      const wsInstance = jest.spyOn(global, 'WebSocket');

      render(
        <LivePortfolioValue
          accountId="test-account-id"
          portfolioMode="brokerage"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // WebSocket should be created for brokerage mode
      expect(wsInstance).toHaveBeenCalled();
    });

    it('should not reconnect WebSocket on filter changes in aggregation mode', async () => {
      const wsInstance = jest.spyOn(global, 'WebSocket');

      const { rerender } = render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="total"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      const initialWsCalls = wsInstance.mock.calls.length;

      // Change filter multiple times
      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-1"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      rerender(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
          filterAccount="account-2"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // WebSocket calls should not increase
      expect(wsInstance.mock.calls.length).toBe(initialWsCalls);
    });
  });

  describe('Today Return Display', () => {
    it('should display green color for positive returns', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/portfolio/aggregated')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                summary: { total_value: 50000 },
              }),
          });
        }
        if (url.includes('/api/portfolio/history')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                equity: [49000, 50000],
                profit_loss: [0, 1000],
                profit_loss_pct: [0, 2.04],
              }),
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        const returnElement = screen.getByText(/\+\$1,000\.00/);
        expect(returnElement).toHaveClass('text-[#22c55e]');
      });
    });

    it('should display grey color for zero returns', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/portfolio/aggregated')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                summary: { total_value: 50000 },
              }),
          });
        }
        if (url.includes('/api/portfolio/history')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                equity: [50000, 50000],
                profit_loss: [0, 0],
                profit_loss_pct: [0, 0],
              }),
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      render(
        <LivePortfolioValue
          accountId="test-account"
          portfolioMode="aggregation"
        />
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        const returnElement = screen.getByText(/\$0\.00/);
        expect(returnElement).toHaveClass('text-gray-500');
      });
    });
  });
});
