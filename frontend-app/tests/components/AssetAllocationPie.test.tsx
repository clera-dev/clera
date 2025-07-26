import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssetAllocationPie from '../../components/portfolio/AssetAllocationPie';

// Mock the fetch function
global.fetch = jest.fn();

// Mock recharts components
jest.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: any) => <div data-testid="pie" data-length={data?.length || 0}>{JSON.stringify(data)}</div>,
  Cell: () => <div data-testid="cell" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

// Mock UI components
jest.mock('../../components/ui/tabs', () => ({
  Tabs: ({ children, onValueChange, value }: any) => (
    <div data-testid="tabs" data-value={value} onClick={() => onValueChange?.('assetClass')}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button data-testid={`tab-${value}`} data-value={value}>
      {children}
    </button>
  ),
}));

jest.mock('../../components/ui/card', () => ({
  CardDescription: ({ children }: any) => <div data-testid="card-description">{children}</div>,
}));

jest.mock('../../components/ui/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// Mock the SectorAllocationPie component
jest.mock('../../components/portfolio/SectorAllocationPie', () => {
  return function MockSectorAllocationPie() {
    return <div data-testid="sector-allocation-pie">Sector Allocation</div>;
  };
});

const mockPositions = [
  {
    symbol: 'AAPL',
    market_value: '5000.00',
    asset_class: 'us_equity',
    qty: '25',
    current_price: '200.00'
  },
  {
    symbol: 'MSFT',
    market_value: '3000.00',
    asset_class: 'us_equity',
    qty: '10',
    current_price: '300.00'
  }
];

const mockCashStockBondResponse = {
  cash: { value: 2000.0, percentage: 20.0 },
  stock: { value: 6000.0, percentage: 60.0 },
  bond: { value: 2000.0, percentage: 20.0 },
  total_value: 10000.0,
  pie_data: [
    {
             name: 'Stock (60.0%)',
       value: 60.0,
       rawValue: 6000.0,
       color: '#4A90E2',
       category: 'stock'
     },
     {
       name: 'Cash (20.0%)',
       value: 20.0,
       rawValue: 2000.0,
       color: '#87CEEB',
       category: 'cash'
     },
     {
       name: 'Bond (20.0%)',
       value: 20.0,
       rawValue: 2000.0,
       color: '#2E5BBA',
       category: 'bond'
    }
  ]
};

describe('AssetAllocationPie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with positions', () => {
    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    expect(screen.getByTestId('tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tab-assetClass')).toBeInTheDocument();
    expect(screen.getByTestId('tab-sector')).toBeInTheDocument();
  });

  it('shows loading state while fetching cash/stock/bond data', async () => {
    // Mock a slow response
    (global.fetch as jest.Mock).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve(mockCashStockBondResponse)
      }), 100))
    );

    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    // Should show skeleton while loading
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('fetches and displays cash/stock/bond allocation', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockCashStockBondResponse)
    });

    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/portfolio/cash-stock-bond-allocation?accountId=test-account-123'
      );
    });

    // Should render pie chart with new data
    await waitFor(() => {
      const pieElement = screen.getByTestId('pie');
      expect(pieElement).toBeInTheDocument();
      expect(pieElement.getAttribute('data-length')).toBe('3');
    });
  });

  it('falls back to original logic when new endpoint fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    // Wait for error handling
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Should still render pie chart with fallback data
    await waitFor(() => {
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('handles empty positions correctly', () => {
    render(
      <AssetAllocationPie 
        positions={[]} 
        accountId="test-account-123" 
      />
    );

    expect(screen.getByText('No position data available.')).toBeInTheDocument();
  });

  it('handles missing account ID', () => {
    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId={null} 
      />
    );

    // Should not fetch data without account ID
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refetches data when refresh timestamp changes', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCashStockBondResponse)
    });

    const { rerender } = render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123"
        refreshTimestamp={1000}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Change refresh timestamp
    rerender(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123"
        refreshTimestamp={2000}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('uses compact layout when chat sidebar is visible', () => {
    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123"
        sideChatVisible={true}
      />
    );

    // Component should handle compact layout logic
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('switches to sector view correctly', async () => {
    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    // Click on sector tab (mocked)
    const tabs = screen.getByTestId('tabs');
    tabs.click(); // This would trigger the onValueChange in the mock

    await waitFor(() => {
      expect(screen.getByTestId('sector-allocation-pie')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'Server error' })
    });

    render(
      <AssetAllocationPie 
        positions={mockPositions} 
        accountId="test-account-123" 
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Should handle error and show fallback
    await waitFor(() => {
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  describe('Cash/Stock/Bond Data Processing', () => {
    it('correctly processes pie data with all three categories', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCashStockBondResponse)
      });

      render(
        <AssetAllocationPie 
          positions={mockPositions} 
          accountId="test-account-123" 
        />
      );

      await waitFor(() => {
        const pieElement = screen.getByTestId('pie');
        const data = JSON.parse(pieElement.textContent || '[]');
        
        expect(data).toHaveLength(3);
        expect(data[0].category).toBe('stock');
        expect(data[1].category).toBe('cash');
        expect(data[2].category).toBe('bond');
      });
    });

    it('handles response with only some categories', async () => {
      const stockOnlyResponse = {
        ...mockCashStockBondResponse,
        pie_data: [
                     {
             name: 'Stock (100.0%)',
             value: 100.0,
             rawValue: 10000.0,
             color: '#4A90E2',
             category: 'stock'
           }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(stockOnlyResponse)
      });

      render(
        <AssetAllocationPie 
          positions={mockPositions} 
          accountId="test-account-123" 
        />
      );

      await waitFor(() => {
        const pieElement = screen.getByTestId('pie');
        expect(pieElement.getAttribute('data-length')).toBe('1');
      });
    });

    it('handles empty pie_data array', async () => {
      const emptyResponse = {
        ...mockCashStockBondResponse,
        pie_data: []
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyResponse)
      });

      render(
        <AssetAllocationPie 
          positions={mockPositions} 
          accountId="test-account-123" 
        />
      );

      await waitFor(() => {
        // Should fall back to original logic
        expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      });
    });
  });
}); 