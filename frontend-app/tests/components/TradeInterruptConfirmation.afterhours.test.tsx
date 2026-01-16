import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TradeInterruptConfirmation } from '../../components/chat/TradeInterruptConfirmation';

jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
}));

let mockFetch: jest.Mock;

beforeEach(() => {
  global.fetch = jest.fn();
  mockFetch = global.fetch as jest.Mock;
});

afterEach(() => {
  jest.resetAllMocks();
});

function setupFetchMocks() {
  mockFetch.mockImplementation((url: RequestInfo) => {
    if (String(url).includes('/api/snaptrade/market-status')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          market: {
            is_open: false,
            status: 'after_hours',
            message: 'After hours',
            next_open: new Date().toISOString(),
            orders_accepted: true,
          },
        }),
      } as Response);
    }
    if (String(url).includes('/api/snaptrade/trade-enabled-accounts')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          accounts: [{
            account_id: 'account-123',
            institution_name: 'Webull',
            account_name: 'Individual',
            buying_power: 1000,
            connection_status: 'active',
          }],
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      json: async () => ({ error: 'unexpected' }),
    } as Response);
  });
}

describe('TradeInterruptConfirmation after-hours handling', () => {
  test('includes after-hours policy and limit price in confirmation', async () => {
    setupFetchMocks();
    const onConfirm = jest.fn();

    render(
      <TradeInterruptConfirmation
        interrupt={{
          value: `TRADE CONFIRMATION REQUIRED\n\n• BUY $100.00 of AAPL\n• Trading Account: Webull - Individual\n• Current Price: $100.00 per share\n• Approximate Shares: 1.00 shares\n• Order Type: Market Order\n\n⚠️ IMPORTANT: Final shares and price may vary due to market movements.\nPlease confirm with 'Yes' to execute or 'No' to cancel.`,
          runId: 'run-123',
          resumable: true,
        }}
        onConfirm={onConfirm}
        isLoading={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Select how to handle after-hours/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Select how to handle after-hours/i));
    fireEvent.click(screen.getByText('Limit order (broker queues)'));

    const limitInput = screen.getByPlaceholderText('Enter limit price');
    fireEvent.change(limitInput, { target: { value: '101.00' } });

    fireEvent.click(screen.getByText(/Execute BUY/i));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
      const payload = JSON.parse(onConfirm.mock.calls[0][0]);
      expect(payload.after_hours_policy).toBe('broker_limit_gtc');
      expect(payload.limit_price).toBe(101);
    });
  });
});
