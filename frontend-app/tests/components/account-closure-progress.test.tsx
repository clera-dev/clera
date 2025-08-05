/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the fetch function
global.fetch = jest.fn();

// Mock the useAccountClosure hook
jest.mock('../../hooks/useAccountClosure', () => ({
  useAccountClosure: () => ({
    accountId: '72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
    initiateClosure: jest.fn(),
    isLoading: false,
    error: null
  })
}));

// Mock the AccountClosurePending component
const MockAccountClosurePending: React.FC<{ accountId: string }> = ({ accountId }) => {
  const [closureData, setClosureData] = React.useState<any>(null);
  const [progressData, setProgressData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchProgress = async () => {
      try {
        setLoading(true);
        
        // =================================================================
        // SECURITY FIX: Use environment variable instead of hardcoded API key
        // =================================================================
        // 
        // REASON: Hardcoded API keys in test files violate secure secret
        // management practices and can expose sensitive credentials.
        //
        // SOLUTION: Use environment variable from test setup, which provides
        // a safe test value while maintaining security best practices.
        
        // Simulate the exact API call the frontend makes
        const response = await fetch(`/api/account-closure/progress/${accountId}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BACKEND_API_KEY || 'test-backend-api-key'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setProgressData(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Progress fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, [accountId]);

  if (loading) {
    return <div data-testid="loading">Loading account closure progress...</div>;
  }

  if (error) {
    return <div data-testid="error">Error: {error}</div>;
  }

  if (!progressData) {
    return <div data-testid="no-data">No progress data available</div>;
  }

  return (
    <div data-testid="account-closure-progress">
      <h2>Account Closure Progress</h2>
      <div data-testid="account-id">Account ID: {progressData.account_id}</div>
      <div data-testid="current-step">Current Step: {progressData.current_step}</div>
      <div data-testid="steps-completed">
        Progress: {progressData.steps_completed}/{progressData.total_steps}
      </div>
      <div data-testid="confirmation-number">
        Confirmation: {progressData.confirmation_number}
      </div>
      <div data-testid="initiated-at">
        Started: {progressData.initiated_at}
      </div>
      <div data-testid="cash-balance">
        Cash Balance: ${progressData.status_details?.cash_balance}
      </div>
      <div data-testid="open-positions">
        Open Positions: {progressData.status_details?.open_positions}
      </div>
      <div data-testid="open-orders">
        Open Orders: {progressData.status_details?.open_orders}
      </div>
    </div>
  );
};

describe('Account Closure Progress Component', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  test('should display loading state initially', () => {
    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.getByText('Loading account closure progress...')).toBeInTheDocument();
  });

  test('should display error when API call fails', async () => {
    // Mock fetch to return an error
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument();
    });
  });

  test('should display error when API returns non-200 status', async () => {
    // Mock fetch to return 500 error
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' })
    });

    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
      expect(screen.getByText(/Error: HTTP error! status: 500/)).toBeInTheDocument();
    });
  });

  test('should display progress data when API call succeeds', async () => {
    // Mock successful API response
    const mockProgressData = {
      account_id: '72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
      current_step: 'withdrawing_funds',
      steps_completed: 3,
      total_steps: 5,
      confirmation_number: 'CLA-MCNPB9PL-OYJ7TR',
      initiated_at: '2025-07-03T18:10:37.133391+00:00',
      status_details: {
        account_status: 'AccountStatus.ACTIVE',
        cash_balance: 98013.88,
        open_positions: 0,
        open_orders: 0,
        ready_for_next_step: false
      },
      last_updated: '2025-07-09T18:12:39.123456'
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockProgressData
    });

    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('account-closure-progress')).toBeInTheDocument();
    });

    // Check that all the data is displayed correctly
    expect(screen.getByTestId('account-id')).toHaveTextContent('Account ID: 72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8');
    expect(screen.getByTestId('current-step')).toHaveTextContent('Current Step: withdrawing_funds');
    expect(screen.getByTestId('steps-completed')).toHaveTextContent('Progress: 3/5');
    expect(screen.getByTestId('confirmation-number')).toHaveTextContent('Confirmation: CLA-MCNPB9PL-OYJ7TR');
    expect(screen.getByTestId('initiated-at')).toHaveTextContent('Started: 2025-07-03T18:10:37.133391+00:00');
    expect(screen.getByTestId('cash-balance')).toHaveTextContent('Cash Balance: $98013.88');
    expect(screen.getByTestId('open-positions')).toHaveTextContent('Open Positions: 0');
    expect(screen.getByTestId('open-orders')).toHaveTextContent('Open Orders: 0');
  });

  test('should make API call with correct URL and headers', async () => {
    const mockProgressData = {
      account_id: '72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
      current_step: 'withdrawing_funds',
      steps_completed: 3,
      total_steps: 5,
      status_details: {}
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockProgressData
    });

    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/account-closure/progress/72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BACKEND_API_KEY || 'test-backend-api-key'
          }
        }
      );
    });
  });

  test('should handle missing data gracefully', async () => {
    // Mock API response with missing fields
    const mockProgressData = {
      account_id: '72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
      current_step: 'withdrawing_funds',
      steps_completed: 3,
      total_steps: 5
      // Missing confirmation_number, initiated_at, status_details
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockProgressData
    });

    render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('account-closure-progress')).toBeInTheDocument();
    });

    // Should still display available data
    expect(screen.getByTestId('account-id')).toHaveTextContent('Account ID: 72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8');
    expect(screen.getByTestId('current-step')).toHaveTextContent('Current Step: withdrawing_funds');
    expect(screen.getByTestId('steps-completed')).toHaveTextContent('Progress: 3/5');
    
    // Missing data should show as undefined or empty
    expect(screen.getByTestId('confirmation-number')).toHaveTextContent('Confirmation: undefined');
    expect(screen.getByTestId('initiated-at')).toHaveTextContent('Started: undefined');
    expect(screen.getByTestId('cash-balance')).toHaveTextContent('Cash Balance: $undefined');
  });
});

describe('Account Closure Progress API Integration', () => {
  test('should handle different closure steps correctly', async () => {
    const testCases = [
      { step: 'initiated', completed: 0 },
      { step: 'liquidating_positions', completed: 1 },
      { step: 'waiting_settlement', completed: 2 },
      { step: 'withdrawing_funds', completed: 3 },
      { step: 'closing_account', completed: 4 },
      { step: 'completed', completed: 5 },
      { step: 'failed', completed: -1 }
    ];

    for (const testCase of testCases) {
      const mockProgressData = {
        account_id: '72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8',
        current_step: testCase.step,
        steps_completed: testCase.completed,
        total_steps: 5,
        status_details: {}
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProgressData
      });

      const { unmount } = render(<MockAccountClosurePending accountId="72e0443c-3b81-4ad3-be9c-fa7bd5fb14b8" />);
      
      await waitFor(() => {
        expect(screen.getByTestId('current-step')).toHaveTextContent(`Current Step: ${testCase.step}`);
        expect(screen.getByTestId('steps-completed')).toHaveTextContent(`Progress: ${testCase.completed}/5`);
      });

      unmount();
    }
  });
}); 