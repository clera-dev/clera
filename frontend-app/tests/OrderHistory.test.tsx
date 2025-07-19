import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrderHistory from '@/components/dashboard/OrderHistory';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = jest.fn();

const mockOrders = [
  {
    id: 'order-1',
    symbol: 'AAPL',
    side: 'buy',
    qty: '10',
    filled_qty: '10',
    filled_avg_price: '150.50',
    notional: '1505.00',
    status: 'filled',
    created_at: '2024-01-15T10:30:00Z',
    filled_at: '2024-01-15T10:31:00Z',
    submitted_at: '2024-01-15T10:30:30Z',
    order_type: 'market',
    time_in_force: 'day',
    commission: '0.00'
  },
  {
    id: 'order-2',
    symbol: 'TSLA',
    side: 'sell',
    qty: '5',
    filled_qty: '5',
    filled_avg_price: '250.75',
    notional: '1253.75',
    status: 'filled',
    created_at: '2024-01-14T14:20:00Z',
    filled_at: '2024-01-14T14:21:00Z',
    submitted_at: '2024-01-14T14:20:30Z',
    order_type: 'market',
    time_in_force: 'day',
    commission: '0.00'
  },
  {
    id: 'order-3',
    symbol: 'MSFT',
    side: 'buy',
    qty: '20',
    filled_qty: null,
    filled_avg_price: null,
    notional: '8000.00',
    status: 'pending',
    created_at: '2024-01-16T09:15:00Z',
    filled_at: null,
    submitted_at: '2024-01-16T09:15:30Z',
    order_type: 'limit',
    time_in_force: 'day',
    limit_price: '400.00',
    commission: null
  }
];

describe('OrderHistory Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-account-id');
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep loading state
      );

      render(<OrderHistory />);
      
      expect(screen.getByText('Order History')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });
  });

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
        expect(screen.getByText('Try again')).toBeInTheDocument();
      });
    });

    it('should show error when no account ID is found', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('No account ID found'));

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('No account ID found')).toBeInTheDocument();
      });
    });

    it('should show error when API returns non-array response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'Invalid response' })
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid response format')).toBeInTheDocument();
      });
    });

    it('should show error when API returns non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to fetch order history: Not Found')).toBeInTheDocument();
      });
    });

    it('should retry fetch when retry button is clicked', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockOrders)
        });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Try again'));

      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('TSLA')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no orders are returned', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('No orders found')).toBeInTheDocument();
        expect(screen.getByText('Your completed orders will appear here')).toBeInTheDocument();
      });
    });
  });

  describe('Order Display', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOrders)
      });
    });

    it('should display orders correctly', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('TSLA')).toBeInTheDocument();
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });
    });

    it('should show correct order status badges', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('filled')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();
      });
    });

    it('should show correct side indicators', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('BUY')).toBeInTheDocument();
        expect(screen.getByText('SELL')).toBeInTheDocument();
      });
    });

    it('should format dates correctly', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        // Check that dates are formatted (not raw ISO strings)
        expect(screen.getByText(/Created:/)).toBeInTheDocument();
        expect(screen.getByText(/Filled:/)).toBeInTheDocument();
      });
    });

    it('should format currency correctly', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('@ $150.50')).toBeInTheDocument();
        expect(screen.getByText('@ $250.75')).toBeInTheDocument();
      });
    });

    it('should format numbers correctly', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('10 shares')).toBeInTheDocument();
        expect(screen.getByText('5 shares')).toBeInTheDocument();
      });
    });
  });

  describe('Order Details Modal', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOrders)
      });
    });

    it('should open modal when order is clicked', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('AAPL'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
        expect(screen.getByText('AAPL')).toBeInTheDocument();
        expect(screen.getByText('BUY')).toBeInTheDocument();
        expect(screen.getByText('filled')).toBeInTheDocument();
      });
    });

    it('should display order details correctly in modal', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('AAPL'));

      await waitFor(() => {
        expect(screen.getByText('Order ID')).toBeInTheDocument();
        expect(screen.getByText('order-1')).toBeInTheDocument();
        expect(screen.getByText('Order Type')).toBeInTheDocument();
        expect(screen.getByText('market')).toBeInTheDocument();
        expect(screen.getByText('Timestamps')).toBeInTheDocument();
        expect(screen.getByText('Order Details')).toBeInTheDocument();
        expect(screen.getByText('Quantity:')).toBeInTheDocument();
        expect(screen.getByText('10 shares')).toBeInTheDocument();
        expect(screen.getByText('Avg Price: $150.50')).toBeInTheDocument();
      });
    });

    it('should close modal when close button is clicked', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('AAPL'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));

      await waitFor(() => {
        expect(screen.queryByText('Order Details')).not.toBeInTheDocument();
      });
    });

    it('should close modal when clicking outside', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('AAPL'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
      });

      // Click on the backdrop
      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByText('Order Details')).not.toBeInTheDocument();
      });
    });

    it('should handle orders with missing optional fields', async () => {
      const incompleteOrder = {
        id: 'order-incomplete',
        symbol: 'INCOMPLETE',
        side: 'buy',
        status: 'pending',
        created_at: '2024-01-15T10:30:00Z',
        order_type: 'market',
        time_in_force: 'day'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([incompleteOrder])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('INCOMPLETE')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('INCOMPLETE'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
        expect(screen.getByText('INCOMPLETE')).toBeInTheDocument();
        // Should not crash when optional fields are missing
        expect(screen.getByText('pending')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle orders with very large numbers', async () => {
      const largeOrder = {
        id: 'order-large',
        symbol: 'LARGE',
        side: 'buy',
        qty: '999999999.99999999',
        filled_qty: '999999999.99999999',
        filled_avg_price: '999999.99',
        notional: '999999999999.99',
        status: 'filled',
        created_at: '2024-01-15T10:30:00Z',
        filled_at: '2024-01-15T10:31:00Z',
        submitted_at: '2024-01-15T10:30:30Z',
        order_type: 'market',
        time_in_force: 'day',
        commission: '999.99'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([largeOrder])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('LARGE')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('LARGE'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
        // Should format large numbers correctly
        expect(screen.getByText(/999,999,999/)).toBeInTheDocument();
      });
    });

    it('should handle orders with zero values', async () => {
      const zeroOrder = {
        id: 'order-zero',
        symbol: 'ZERO',
        side: 'buy',
        qty: '0',
        filled_qty: '0',
        filled_avg_price: '0',
        notional: '0',
        status: 'filled',
        created_at: '2024-01-15T10:30:00Z',
        filled_at: '2024-01-15T10:31:00Z',
        submitted_at: '2024-01-15T10:30:30Z',
        order_type: 'market',
        time_in_force: 'day',
        commission: '0'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([zeroOrder])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('ZERO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('ZERO'));

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
        // Should handle zero values gracefully
        expect(screen.getByText('0 shares')).toBeInTheDocument();
      });
    });

    it('should handle orders with invalid dates', async () => {
      const invalidDateOrder = {
        id: 'order-invalid-date',
        symbol: 'INVALID',
        side: 'buy',
        status: 'filled',
        created_at: 'invalid-date',
        order_type: 'market',
        time_in_force: 'day'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([invalidDateOrder])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('INVALID')).toBeInTheDocument();
      });

      // Should not crash with invalid dates
      expect(screen.getByText('INVALID')).toBeInTheDocument();
    });

    it('should handle orders with special characters in symbol', async () => {
      const specialSymbolOrder = {
        id: 'order-special',
        symbol: 'BRK.A',
        side: 'buy',
        status: 'filled',
        created_at: '2024-01-15T10:30:00Z',
        order_type: 'market',
        time_in_force: 'day'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([specialSymbolOrder])
      });

      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('BRK.A')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOrders)
      });
    });

    it('should have proper ARIA labels', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('Order History')).toBeInTheDocument();
      });

      // Check for dialog role when modal is open
      fireEvent.click(screen.getByText('AAPL'));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should be keyboard navigable', async () => {
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('AAPL')).toBeInTheDocument();
      });

      // Tab to first order and press Enter
      const firstOrder = screen.getByText('AAPL').closest('div');
      if (firstOrder) {
        firstOrder.focus();
        fireEvent.keyDown(firstOrder, { key: 'Enter' });
      }

      await waitFor(() => {
        expect(screen.getByText('Order Details')).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large number of orders efficiently', async () => {
      const largeOrderList = Array.from({ length: 100 }, (_, i) => ({
        id: `order-${i}`,
        symbol: `STOCK${i}`,
        side: i % 2 === 0 ? 'buy' : 'sell',
        status: 'filled',
        created_at: '2024-01-15T10:30:00Z',
        order_type: 'market',
        time_in_force: 'day'
      }));

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(largeOrderList)
      });

      const startTime = performance.now();
      render(<OrderHistory />);
      
      await waitFor(() => {
        expect(screen.getByText('STOCK0')).toBeInTheDocument();
        expect(screen.getByText('STOCK99')).toBeInTheDocument();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(1000);
    });
  });
}); 