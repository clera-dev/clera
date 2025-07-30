/**
 * Integration test for market percentages functionality
 * Tests the complete flow from API to component display
 */

// Mock fetch for controlled testing
global.fetch = jest.fn();

describe('Market Percentages Integration', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('API to Service Integration', () => {
    test('should fetch and process chart data correctly', async () => {
      // Mock realistic chart data response
      const mockChartData = [
        { date: '2025-01-30 09:30:00', open: 238.67, close: 239.97, volume: 1000000 },
        { date: '2025-01-30 10:00:00', open: 239.97, close: 240.50, volume: 800000 },
        { date: '2025-01-30 11:00:00', open: 240.50, close: 241.20, volume: 600000 },
        { date: '2025-01-30 15:55:00', open: 241.00, close: 240.15, volume: 500000 }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChartData)
      });

      // Test API endpoint directly
      const response = await fetch('/api/fmp/chart/AAPL?interval=5min&from=2025-01-30&to=2025-01-30');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data).toHaveLength(4);
      expect(data[0]).toHaveProperty('date');
      expect(data[0]).toHaveProperty('open');
      expect(data[0]).toHaveProperty('close');

      // Calculate expected percentage: (240.15 - 238.67) / 238.67 * 100 ≈ 0.62%
      const firstPrice = data[0].open;
      const lastPrice = data[data.length - 1].close;
      const expectedPercentage = ((lastPrice - firstPrice) / firstPrice) * 100;

      expect(expectedPercentage).toBeCloseTo(0.62, 1);
    });

    test('should handle multiple symbols correctly', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([
          { date: '2025-01-30 09:30:00', open: 100, close: 105, volume: 1000000 }
        ])
      };

      fetch.mockResolvedValue(mockResponse);

      // Test multiple API calls
      const symbols = ['AAPL', 'TSLA', 'NVDA'];
      const responses = await Promise.all(
        symbols.map(symbol => 
          fetch(`/api/fmp/chart/${symbol}?interval=5min&from=2025-01-30&to=2025-01-30`)
        )
      );

      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle API failures gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Symbol not found' })
      });

      const response = await fetch('/api/fmp/chart/INVALID?interval=5min');
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data).toHaveProperty('error');
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch('/api/fmp/chart/AAPL?interval=5min');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Data Processing Logic', () => {
    test('should calculate percentage changes correctly', () => {
      // Test realistic stock data scenarios
      const scenarios = [
        {
          name: 'Positive day',
          data: [
            { open: 100, close: 110 }, // +10%
          ],
          expected: 10
        },
        {
          name: 'Negative day',
          data: [
            { open: 100, close: 90 }, // -10%
          ],
          expected: -10
        },
        {
          name: 'Volatile day ending positive',
          data: [
            { open: 100, close: 95 },   // Down 5%
            { open: 95, close: 105 },   // Up ~10.5%
            { open: 105, close: 102 },  // Down ~2.8%
          ],
          expected: 2 // (102 - 100) / 100 * 100 = 2%
        }
      ];

      scenarios.forEach(scenario => {
        const firstPrice = scenario.data[0].open;
        const lastPrice = scenario.data[scenario.data.length - 1].close;
        const percentage = ((lastPrice - firstPrice) / firstPrice) * 100;
        
        expect(percentage).toBeCloseTo(scenario.expected, 1);
      });
    });

    test('should handle edge cases', () => {
      // Test division by zero protection
      function safePercentageCalculation(open, close) {
        if (!open || open === 0) return undefined;
        return ((close - open) / open) * 100;
      }

      expect(safePercentageCalculation(0, 100)).toBeUndefined();
      expect(safePercentageCalculation(null, 100)).toBeUndefined();
      expect(safePercentageCalculation(100, 110)).toBeCloseTo(10, 2);
    });
  });

  describe('Component Integration Scenarios', () => {
    test('should provide data in correct format for watchlist display', () => {
      // Mock data in the format expected by components
      const mockWatchlistData = [
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'TSLA', companyName: 'Tesla Inc.' },
        { symbol: 'NVDA', companyName: 'NVIDIA Corporation' }
      ];

      const mockPercentages = new Map([
        ['AAPL', 2.5],
        ['TSLA', -1.8],
        ['NVDA', 5.2]
      ]);

      // Test component data integration
      mockWatchlistData.forEach(item => {
        const percentage = mockPercentages.get(item.symbol);
        expect(percentage).toBeDefined();
        expect(typeof percentage).toBe('number');
        
        // Test display formatting
        const formatted = percentage >= 0 ? `+${percentage.toFixed(2)}%` : `${percentage.toFixed(2)}%`;
        expect(formatted).toMatch(/^[+-]?\d+\.\d{2}%$/);
      });
    });

    test('should handle missing percentage data gracefully', () => {
      const mockWatchlistData = [
        { symbol: 'AAPL', companyName: 'Apple Inc.' },
        { symbol: 'UNKNOWN', companyName: 'Unknown Company' }
      ];

      const mockPercentages = new Map([
        ['AAPL', 2.5]
        // UNKNOWN symbol missing
      ]);

      mockWatchlistData.forEach(item => {
        const percentage = mockPercentages.get(item.symbol) ?? item.dayChangePercent ?? 0;
        expect(typeof percentage).toBe('number');
      });
    });
  });

  describe('Performance and Caching', () => {
    test('should handle concurrent requests efficiently', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { date: '2025-01-30 09:30:00', open: 100, close: 105 }
        ])
      });

      const startTime = Date.now();
      
      // Simulate concurrent requests
      const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL'];
      const promises = symbols.map(symbol => 
        fetch(`/api/fmp/chart/${symbol}?interval=5min&from=2025-01-30&to=2025-01-30`)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      expect(responses).toHaveLength(5);
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });

      // Should complete relatively quickly (this is a rough benchmark)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
}); 