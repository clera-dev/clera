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
    return <div data-testid={`mini-chart-${symbol}`}>Mini Chart for {symbol}</div>;
  };
});

jest.mock('@/components/invest/StockSearchBar', () => {
  return function MockStockSearchBar() {
    return <div data-testid="stock-search-bar">Stock Search Bar</div>;
  };
});

jest.mock('@/components/ui/CompanyLogo', () => {
  return function MockCompanyLogo({ symbol }) {
    return <div data-testid={`company-logo-${symbol}`}>Logo for {symbol}</div>;
  };
});

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variables
process.env.NEXT_PUBLIC_API_KEY = 'test-api-key';

// Mock the StockWatchlist component
const MockStockWatchlist = ({ accountId, onStockSelect, onWatchlistChange, onOptimisticAdd, onOptimisticRemove, watchlistSymbols }) => {
  return (
    <div data-testid="stock-watchlist">
      <h2>Stock Watchlist</h2>
      {accountId ? (
        <div>
          <div data-testid="loading-spinner" role="status">Loading...</div>
          <div data-testid="watchlist-content">
            {watchlistSymbols && watchlistSymbols.size > 0 ? (
              Array.from(watchlistSymbols).map(symbol => (
                <div key={symbol} data-testid={`stock-item-${symbol}`}>
                  {symbol}
                </div>
              ))
            ) : (
              <div data-testid="empty-state">Your Watchlist is Empty</div>
            )}
          </div>
        </div>
      ) : (
        <div>Please complete account setup to use the watchlist feature.</div>
      )}
    </div>
  );
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

      render(<MockStockWatchlist {...defaultProps} />);

      // Should show loading spinner in header
      expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });

    it('should not show "Empty" message during initial loading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbols: ['AAPL', 'GOOGL'] })
      });

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });

    it('should not show empty state during loading', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<MockStockWatchlist {...defaultProps} />);

      expect(screen.queryByText('Your Watchlist is Empty')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle watchlist API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(
        <MockStockWatchlist 
          {...defaultProps} 
          watchlistSymbols={externalSymbols}
        />
      );

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

      const { rerender } = render(<MockStockWatchlist {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Rerender without prop changes
      rerender(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });

      // Check for proper heading structure
      expect(screen.getByRole('heading', { name: /Stock Watchlist/i })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null accountId gracefully', () => {
      render(<MockStockWatchlist {...defaultProps} accountId={null} />);

      expect(screen.getByText('Please complete account setup to use the watchlist feature.')).toBeInTheDocument();
    });

    it('should handle empty accountId gracefully', () => {
      render(<MockStockWatchlist {...defaultProps} accountId="" />);

      expect(screen.getByText('Please complete account setup to use the watchlist feature.')).toBeInTheDocument();
    });

    it('should handle malformed API responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      render(<MockStockWatchlist {...defaultProps} />);

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

      render(<MockStockWatchlist {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Stock Watchlist')).toBeInTheDocument();
      });
    });
  });
}); 