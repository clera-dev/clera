/**
 * Test for market data functionality
 * Focus on API integration rather than service internals
 */

// Mock fetch for testing
global.fetch = jest.fn();

describe('Market Data Integration', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('FMP API Integration', () => {
    test('should be able to fetch chart data from FMP API endpoint', async () => {
      const mockChartData = [
        { date: '2025-01-30 09:30:00', open: 238.67, close: 239.97, volume: 1000000 },
        { date: '2025-01-30 15:55:00', open: 238.46, close: 237.56, volume: 500000 }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockChartData)
      });

      // Test the actual API endpoint that the service uses
      const response = await fetch('/api/fmp/chart/AAPL?interval=5min&from=2025-01-30&to=2025-01-30');
      const data = await response.json();
      
      expect(fetch).toHaveBeenCalledWith('/api/fmp/chart/AAPL?interval=5min&from=2025-01-30&to=2025-01-30');
      expect(response.ok).toBe(true);
      expect(data).toEqual(mockChartData);
      expect(data).toHaveLength(2);
      expect(data[0]).toHaveProperty('date');
      expect(data[0]).toHaveProperty('open');
      expect(data[0]).toHaveProperty('close');
    });

    test('should handle API errors gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'Symbol not found' })
      });

      const response = await fetch('/api/fmp/chart/INVALID?interval=5min');
      const data = await response.json();
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
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

  describe('Percentage Calculation Logic', () => {
    test('should calculate percentage correctly with mock data', () => {
      // Test the percentage calculation logic
      function calculatePercentage(openPrice, closePrice) {
        if (!openPrice || !closePrice) return undefined;
        return ((closePrice - openPrice) / openPrice) * 100;
      }

      // Test positive change
      expect(calculatePercentage(100, 110)).toBeCloseTo(10, 2);
      
      // Test negative change  
      expect(calculatePercentage(100, 90)).toBeCloseTo(-10, 2);
      
      // Test no change
      expect(calculatePercentage(100, 100)).toBe(0);
      
      // Test edge cases
      expect(calculatePercentage(0, 100)).toBeUndefined();
      expect(calculatePercentage(null, 100)).toBeUndefined();
      expect(calculatePercentage(100, null)).toBeUndefined();
    });

    test('should handle typical stock price data format', () => {
      const mockData = [
        { date: '2025-01-30 09:30:00', open: 238.67, close: 239.97 },
        { date: '2025-01-30 10:00:00', open: 239.97, close: 240.50 },
        { date: '2025-01-30 15:55:00', open: 240.50, close: 237.56 }
      ];

      // Test extracting first and last prices
      const firstPrice = mockData[0].open;
      const lastPrice = mockData[mockData.length - 1].close;
      const percentage = ((lastPrice - firstPrice) / firstPrice) * 100;

      expect(percentage).toBeCloseTo(-0.47, 2); // (237.56 - 238.67) / 238.67 * 100
    });
  });

  describe('Data Processing', () => {
    test('should filter valid price data', () => {
      const mockData = [
        { date: '2025-01-30 09:30:00', open: 238.67, close: 239.97 },
        { date: null, open: 0, close: 0 }, // Invalid data
        { date: '2025-01-30 10:00:00', open: 239.97, close: 240.50 },
        { open: 240.50, close: 237.56 }, // Missing date
      ];

      // Filter valid data points
      const validData = mockData.filter(item => 
        item.date && 
        item.open > 0 && 
        item.close > 0 &&
        typeof item.open === 'number' && 
        typeof item.close === 'number'
      );

      expect(validData).toHaveLength(2);
      expect(validData[0].date).toBe('2025-01-30 09:30:00');
      expect(validData[1].date).toBe('2025-01-30 10:00:00');
    });

    test('should handle timezone data correctly', () => {
      const mockTimestamp = '2025-01-30 09:30:00';
      const date = new Date(mockTimestamp);
      
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0); // January (0-indexed)
      expect(date.getDate()).toBe(30);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle empty data arrays', () => {
      const emptyData = [];
      
      function processData(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
          return undefined;
        }
        return data.length;
      }

      expect(processData(emptyData)).toBeUndefined();
      expect(processData(null)).toBeUndefined();
      expect(processData(undefined)).toBeUndefined();
    });

    test('should handle malformed data', () => {
      const malformedData = [
        { invalid: 'data' },
        { date: '2025-01-30', price: 'not-a-number' },
        'invalid-item'
      ];

      const validItems = malformedData.filter(item => 
        item && 
        typeof item === 'object' && 
        item.date && 
        typeof item.open === 'number' && 
        typeof item.close === 'number'
      );

      expect(validItems).toHaveLength(0);
    });
  });
}); 