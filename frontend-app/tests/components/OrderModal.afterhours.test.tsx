import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrderModal from '../../components/invest/OrderModal';

jest.mock('@/utils/market-hours', () => ({
  getMarketStatus: () => ({
    isOpen: false,
    status: 'after_hours',
    message: 'After hours',
    nextOpenTime: 'Tomorrow 9:30 AM ET',
    ordersAccepted: true,
  }),
}));

jest.mock('react-hot-toast', () => ({
  loading: jest.fn(() => 'toast-id'),
  success: jest.fn(),
  error: jest.fn(),
  dismiss: jest.fn(),
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
    if (String(url).includes('/api/market/latest-trade/')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, price: 100 }),
      } as Response);
    }
    if (String(url).includes('/api/snaptrade/trade-enabled-accounts')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          accounts: [{
            account_id: 'account-123',
            institution_name: 'Webull',
            account_name: 'Individual',
            buying_power: 1000,
            connection_status: 'active',
            is_trade_enabled: true,
          }],
        }),
      } as Response);
    }
    if (String(url).includes('/api/trade')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, message: 'ok' }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      json: async () => ({ error: 'unexpected' }),
    } as Response);
  });
}

describe('OrderModal after-hours handling', () => {
  test('submits limit order payload when broker limit selected', async () => {
    setupFetchMocks();

    render(
      <OrderModal
        isOpen={true}
        onClose={jest.fn()}
        symbol="AAPL"
        accountId={null}
        orderType="BUY"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Select how to handle after-hours/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Select how to handle after-hours/i));
    fireEvent.click(screen.getByText('Limit order (broker queues)'));

    const limitInput = screen.getByPlaceholderText('Enter limit price');
    fireEvent.change(limitInput, { target: { value: '101.50' } });

    const amountInput = screen.getByLabelText(/Amount \(\$\)/i);
    fireEvent.change(amountInput, { target: { value: '10' } });

    fireEvent.click(screen.getByText(/Place Buy Limit Order/i));

    await waitFor(() => {
      const tradeCall = mockFetch.mock.calls.find(([url]) => String(url).includes('/api/trade'));
      expect(tradeCall).toBeTruthy();
      const body = JSON.parse(tradeCall?.[1]?.body as string);
      expect(body.order_type).toBe('Limit');
      expect(body.time_in_force).toBe('EHP');
      expect(body.limit_price).toBe(101.5);
      expect(body.after_hours_policy).toBe('broker_limit_gtc');
    });
  });
});
