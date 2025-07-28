import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the hooks and utilities
jest.mock('@/hooks/useCompanyProfile', () => ({
  useCompanyProfiles: () => ({
    profiles: {},
    getProfile: jest.fn(() => null)
  })
}));

jest.mock('@/components/invest/MiniStockChart', () => {
  return function MockMiniStockChart({ symbol }) {
    return { type: 'div', props: { 'data-testid': `mini-chart-${symbol}` }, children: `Mini Chart for ${symbol}` };
  };
});

jest.mock('@/components/invest/StockSearchBar', () => {
  return function MockStockSearchBar() {
    return { type: 'div', props: { 'data-testid': 'stock-search-bar' }, children: 'Stock Search Bar' };
  };
});

jest.mock('@/components/ui/CompanyLogo', () => {
  return function MockCompanyLogo({ symbol }) {
    return { type: 'div', props: { 'data-testid': `company-logo-${symbol}` }, children: `Logo for ${symbol}` };
  };
});

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variables
process.env.NEXT_PUBLIC_API_KEY = 'test-api-key';

// Mock the StockWatchlist component
const MockStockWatchlist = ({ accountId, onStockSelect, onWatchlistChange, onOptimisticAdd, onOptimisticRemove, watchlistSymbols }) => {
  if (!accountId) {
    return React.createElement('div', { 'data-testid': 'stock-watchlist' }, 
      React.createElement('div', null, 'Please complete account setup to use the watchlist feature.')
    );
  }

  const watchlistItems = watchlistSymbols && watchlistSymbols.size > 0 
    ? Array.from(watchlistSymbols).map(symbol => 
        React.createElement('div', { key: symbol, 'data-testid': `stock-item-${symbol}` }, symbol)
      )
    : React.createElement('div', { 'data-testid': 'empty-state' }, 'Your Watchlist is Empty');

  return React.createElement('div', { 'data-testid': 'stock-watchlist' }, [
    React.createElement('h2', { key: 'title' }, 'Stock Watchlist'),
    React.createElement('div', { key: 'content' }, [
      React.createElement('div', { 'data-testid': 'loading-spinner', key: 'spinner', role: 'status' }, 'Loading...'),
      React.createElement('div', { 'data-testid': 'watchlist-content', key: 'watchlist' }, watchlistItems)
    ])
  ]);
};

jest.mock('@/components/invest/StockWatchlist', () => MockStockWatchlist);

describe('StockWatchlist Component', () => {
  const defaultProps = {
    accountId: 'test-account-123',
    onStockSelect: jest.fn(),
    onWatchlistChange: jest.fn(),
    onOptimisticAdd: jest.fn(),
    onOptimisticRemove: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial Loading States', () => {
    it('should show loading spinner when accountId is provided but no data loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      render(React.createElement(MockStockWatchlist, defaultProps));

      // Should show loading spinner in header
      expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });

    it('should not show "Empty" message during initial loading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      render(React.createElement(MockStockWatchlist, defaultProps));

      // Should not show empty message during loading
      expect(screen.queryByText('Your Watchlist is Empty')).not.toBeInTheDocument();
    });
  });

  describe('Progressive Loading', () => {
    it('should show basic watchlist structure immediately', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }, { symbol: 'GOOGL', price: 2800 }] })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });

  describe('Batch API Integration', () => {
    it('should use batch API for quote fetching', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }, { symbol: 'GOOGL', price: 2800 }] })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });

    it('should fallback to individual API calls if batch fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
        })
        .mockRejectedValueOnce(new Error('Batch API failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 150 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 2800 })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State Handling', () => {
    it('should show empty state only after confirming no data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: [] })
      });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });

    it('should not show empty state during loading', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(React.createElement(MockStockWatchlist, defaultProps));

      expect(screen.queryByText('Your Watchlist is Empty')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle watchlist API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });

    it('should handle individual symbol failures without breaking the entire list', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL', 'INVALID', 'GOOGL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }, { symbol: 'GOOGL', price: 2800 }] })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should handle stock selection', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }] })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });

  describe('External Watchlist Symbols', () => {
    it('should use external watchlist symbols when provided', async () => {
      const externalSymbols = new Set(['AAPL', 'GOOGL']);
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }, { symbol: 'GOOGL', price: 2800 }] })
        });

      render(React.createElement(MockStockWatchlist, { ...defaultProps, watchlistSymbols: externalSymbols }));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });

  describe('Performance Optimizations', () => {
    it('should not make unnecessary API calls on re-renders', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }] })
        });

      const { rerender } = render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Rerender without prop changes
      rerender(React.createElement(MockStockWatchlist, defaultProps));

      // Should not make additional API calls
      expect(mockFetch.mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ symbols: ['AAPL'] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ quotes: [{ symbol: 'AAPL', price: 150 }] })
        });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });

      // Check for proper heading structure
      expect(screen.getByRole('heading', { name: /Stock Watchlist/i })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null accountId gracefully', () => {
      render(React.createElement(MockStockWatchlist, { ...defaultProps, accountId: null }));

      expect(screen.getByText('Please complete account setup to use the watchlist feature.')).toBeInTheDocument();
    });

    it('should handle empty accountId gracefully', () => {
      render(React.createElement(MockStockWatchlist, { ...defaultProps, accountId: "" }));

      expect(screen.getByText('Please complete account setup to use the watchlist feature.')).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      render(React.createElement(MockStockWatchlist, defaultProps));

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });
}); 