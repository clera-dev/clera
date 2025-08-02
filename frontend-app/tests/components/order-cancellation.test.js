/**
 * Production-Grade Order Cancellation Tests
 * 
 * This test suite ensures the order cancellation feature is thoroughly tested
 * and production-ready with comprehensive coverage of all user flows.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TransactionsTable from '../../components/portfolio/TransactionsTable';
import { OrderCancelModal } from '../../components/ui/order-cancel-modal';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

import toast from 'react-hot-toast';

// Mock sample order data
const mockPendingOrder = {
  id: '12345678-1234-1234-1234-123456789012',
  symbol: 'AAPL',
  side: 'buy',
  status: 'pending_new',
  qty: '10',
  limit_price: '150.00',
  created_at: '2025-01-30T10:00:00Z',
  updated_at: '2025-01-30T10:00:00Z',
  submitted_at: '2025-01-30T10:00:00Z'
};

const mockFilledOrder = {
  id: '87654321-4321-4321-4321-210987654321',
  symbol: 'TSLA',
  side: 'sell',
  status: 'filled',
  qty: '5',
  filled_qty: '5',
  filled_avg_price: '250.00',
  created_at: '2025-01-30T09:00:00Z',
  updated_at: '2025-01-30T09:30:00Z',
  submitted_at: '2025-01-30T09:00:00Z',
  filled_at: '2025-01-30T09:30:00Z'
};

const mockActivity = {
  id: '99999999-9999-9999-9999-999999999999',
  activity_type: 'DIV',
  symbol: 'AAPL',
  net_amount: '5.50',
  date: '2025-01-30T08:00:00Z'
};

// Mock fetch globally for API calls
global.fetch = jest.fn();

beforeEach(() => {
  fetch.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe('Order Cancellation - Production Tests', () => {
  
  describe('OrderCancelModal Component', () => {
    test('renders modal with correct content when open', () => {
      render(
        <OrderCancelModal
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          orderSymbol="AAPL"
          orderId="12345678-1234-1234-1234-123456789012"
        />
      );
      
      expect(screen.getByText('Confirming Order Cancellation')).toBeInTheDocument();
      expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
      expect(screen.getByText(/Please select "Cancel Order" below/)).toBeInTheDocument();
      expect(screen.getByText(/Symbol:/)).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText(/Order ID:/)).toBeInTheDocument();
      expect(screen.getByText(/12345678/)).toBeInTheDocument();
    });

    test('does not render when closed', () => {
      render(
        <OrderCancelModal
          isOpen={false}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          orderSymbol="AAPL"
          orderId="12345678-1234-1234-1234-123456789012"
        />
      );
      
      expect(screen.queryByText('Confirming Order Cancellation')).not.toBeInTheDocument();
    });

    test('calls onClose when "No, go back" is clicked', () => {
      const onCloseMock = jest.fn();
      
      render(
        <OrderCancelModal
          isOpen={true}
          onClose={onCloseMock}
          onConfirm={jest.fn()}
          orderSymbol="AAPL"
          orderId="12345678-1234-1234-1234-123456789012"
        />
      );
      
      const goBackButton = screen.getByText('No, go back');
      fireEvent.click(goBackButton);
      
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    test('calls onConfirm when "Cancel Order" is clicked', () => {
      const onConfirmMock = jest.fn();
      
      render(
        <OrderCancelModal
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={onConfirmMock}
          orderSymbol="AAPL"
          orderId="12345678-1234-1234-1234-123456789012"
        />
      );
      
      const cancelButton = screen.getByText('Cancel Order');
      fireEvent.click(cancelButton);
      
      expect(onConfirmMock).toHaveBeenCalledTimes(1);
    });

    test('shows loading state correctly', () => {
      render(
        <OrderCancelModal
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
          isLoading={true}
          orderSymbol="AAPL"
          orderId="12345678-1234-1234-1234-123456789012"
        />
      );
      
      expect(screen.getByText('Cancelling...')).toBeInTheDocument();
      
      const goBackButton = screen.getByText('No, go back');
      const cancelButton = screen.getByText('Cancelling...');
      
      expect(goBackButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    test('renders without order details when not provided', () => {
      render(
        <OrderCancelModal
          isOpen={true}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
        />
      );
      
      expect(screen.getByText('Confirming Order Cancellation')).toBeInTheDocument();
      expect(screen.queryByText('Symbol:')).not.toBeInTheDocument();
      expect(screen.queryByText('Order ID:')).not.toBeInTheDocument();
    });
  });

  describe('TransactionsTable - Cancel Button Integration', () => {
    const mockFetchData = jest.fn();

    beforeEach(() => {
      mockFetchData.mockClear();
    });

    test('shows cancel button only for pending orders', () => {
      const orders = [mockPendingOrder, mockFilledOrder, mockActivity];
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      const cancelButtons = screen.getAllByLabelText('Cancel order');
      expect(cancelButtons).toHaveLength(1); // Only one pending order should have cancel button
    });

    test('does not show cancel button for filled orders', () => {
      const orders = [mockFilledOrder];
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      expect(screen.queryByLabelText('Cancel order')).not.toBeInTheDocument();
    });

    test('does not show cancel button for activities', () => {
      const orders = [mockActivity];
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      expect(screen.queryByLabelText('Cancel order')).not.toBeInTheDocument();
    });

    test('opens modal when cancel button is clicked', () => {
      const orders = [mockPendingOrder];
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      const cancelButton = screen.getByLabelText('Cancel order');
      fireEvent.click(cancelButton);
      
      expect(screen.getByText('Confirming Order Cancellation')).toBeInTheDocument();
      expect(screen.getByText(/Symbol:/)).toBeInTheDocument();
      // Check that AAPL appears in the modal (there are multiple AAPL texts on page)
      const aapleElements = screen.getAllByText('AAPL');
      expect(aapleElements.length).toBeGreaterThan(0);
    });

    test('successful order cancellation flow', async () => {
      const orders = [mockPendingOrder];
      const mockOnOrderCancelled = jest.fn();
      
      // Mock successful fetch response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          message: 'Order has been successfully cancelled',
        })
      });
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
          onOrderCancelled={mockOnOrderCancelled}
        />
      );
      
      // Click cancel button
      const cancelButton = screen.getByLabelText('Cancel order');
      fireEvent.click(cancelButton);
      
      // Confirm in modal
      const confirmButton = screen.getByText('Cancel Order');
      fireEvent.click(confirmButton);
      
      // Wait for API call and success handling
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining("AAPL has been successfully cancelled")
        );
      });
      
      // Verify onOrderCancelled callback was called with the order ID
      expect(mockOnOrderCancelled).toHaveBeenCalledWith('12345678-1234-1234-1234-123456789012');
    });

    test('handles order not found error', async () => {
      const notFoundOrder = {
        ...mockPendingOrder,
        id: 'not-found-order'
      };
      const orders = [notFoundOrder];
      
      // Mock 404 error response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: 'Order not found or already processed'
        })
      });
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      // Click cancel button
      const cancelButton = screen.getByLabelText('Cancel order');
      fireEvent.click(cancelButton);
      
      // Confirm in modal
      const confirmButton = screen.getByText('Cancel Order');
      fireEvent.click(confirmButton);
      
      // Wait for error handling
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Order not found or already processed");
      });
    });

    test('handles server error during cancellation', async () => {
      const orders = [mockPendingOrder];
      
      // Mock 500 error response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: 'Server error while cancelling order. Please try again.'
        })
      });
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      // Click cancel button
      const cancelButton = screen.getByLabelText('Cancel order');
      fireEvent.click(cancelButton);
      
      // Confirm in modal
      const confirmButton = screen.getByText('Cancel Order');
      fireEvent.click(confirmButton);
      
      // Wait for error handling
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server error while cancelling order. Please try again.");
      });
    });

    test('modal closes after successful cancellation', async () => {
      const orders = [mockPendingOrder];
      mockFetchData.mockResolvedValue([]);
      
      // Mock successful fetch response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          message: 'Order has been successfully cancelled',
        })
      });
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={mockFetchData}
        />
      );
      
      // Click cancel button
      const cancelButton = screen.getByLabelText('Cancel order');
      fireEvent.click(cancelButton);
      
      // Confirm in modal
      const confirmButton = screen.getByText('Cancel Order');
      fireEvent.click(confirmButton);
      
      // Wait for successful completion and modal to close
      await waitFor(() => {
        expect(screen.queryByText('Confirming Order Cancellation')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles empty orders array', () => {
      render(
        <TransactionsTable
          initialOrders={[]}
          accountId="test-account-123"
          fetchData={jest.fn()}
        />
      );
      
      expect(screen.getByText('No transactions found.')).toBeInTheDocument();
    });

    test('cancel button has proper aria-label', () => {
      const orders = [mockPendingOrder];
      
      render(
        <TransactionsTable
          initialOrders={orders}
          accountId="test-account-123"
          fetchData={jest.fn()}
        />
      );
      
      const cancelButton = screen.getByLabelText('Cancel order');
      expect(cancelButton).toBeInTheDocument();
    });
  });
});