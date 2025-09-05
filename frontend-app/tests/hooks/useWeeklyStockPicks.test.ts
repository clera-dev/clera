/**
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useWeeklyStockPicks } from '@/hooks/useWeeklyStockPicks';
import { WeeklyStockPicksResponse } from '@/lib/types/weekly-stock-picks';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Sample response data
const sampleSuccessResponse: WeeklyStockPicksResponse = {
  success: true,
  data: {
    stock_picks: [
      {
        ticker: 'NVDA',
        company_name: 'NVIDIA Corporation',
        rationale: 'AI infrastructure leader with strong growth potential',
        risk_level: 'medium'
      },
      {
        ticker: 'MSFT',
        company_name: 'Microsoft Corporation',
        rationale: 'Cloud computing giant with Azure growth',
        risk_level: 'low'
      }
    ],
    investment_themes: [
      {
        title: 'AI Infrastructure',
        summary: 'Capitalize on AI infrastructure demand',
        report: 'The AI revolution is creating unprecedented demand...',
        relevant_tickers: ['NVDA', 'AMD', 'ARM'],
        theme_category: 'Technology'
      }
    ],
    market_analysis: {
      current_environment: 'Markets navigating AI optimism',
      risk_factors: 'Geopolitical tensions, inflation',
      opportunities: 'AI infrastructure build-out'
    }
  },
  metadata: {
    generated_at: '2025-01-30T12:00:00Z',
    week_of: '2025-01-27',
    cached: true
  }
};

const sampleFallbackResponse: WeeklyStockPicksResponse = {
  success: true,
  data: {
    stock_picks: [
      {
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        rationale: 'Strong iPhone sales and ecosystem',
        risk_level: 'medium'
      }
    ],
    investment_themes: [
      {
        title: 'Consumer Tech',
        summary: 'Leading consumer technology companies',
        report: 'Consumer technology continues to evolve...',
        relevant_tickers: ['AAPL', 'GOOGL'],
        theme_category: 'Technology'
      }
    ],
    market_analysis: {
      current_environment: 'Mixed market conditions',
      risk_factors: 'Economic uncertainty',
      opportunities: 'Technology innovation'
    }
  },
  metadata: {
    generated_at: '2025-01-30T12:00:00Z',
    week_of: '2025-01-27',
    cached: false,
    fallback_reason: 'No personalized picks available'
  }
};

describe('useWeeklyStockPicks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and return weekly stock picks successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleSuccessResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    // Initially should be loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have data
    expect(result.current.data).toEqual(sampleSuccessResponse.data);
    expect(result.current.error).toBe(null);
    expect(result.current.lastGenerated).toBe('2025-01-30T12:00:00Z');
    expect(result.current.weekOf).toBe('2025-01-27');
    expect(result.current.isFallback).toBe(false);
  });

  it('should handle fallback data correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleFallbackResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(sampleFallbackResponse.data);
    expect(result.current.error).toBe(null);
    expect(result.current.isFallback).toBe(true);
    expect(result.current.lastGenerated).toBe('2025-01-30T12:00:00Z');
  });

  it('should handle API error response', async () => {
    const errorResponse = {
      success: false,
      error: 'User not authenticated'
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => errorResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe('Request failed with status 401');
    expect(result.current.isFallback).toBe(false);
  });

  it('should handle network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe('Network error');
    expect(result.current.isFallback).toBe(false);
  });

  it('should handle successful response with error flag', async () => {
    const errorResponse: WeeklyStockPicksResponse = {
      success: false,
      error: 'Service temporarily unavailable'
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => errorResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe('Service temporarily unavailable');
  });

  it('should allow manual refetch', async () => {
    // First call returns success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleSuccessResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.stock_picks).toHaveLength(2);

    // Second call returns different data
    const updatedResponse: WeeklyStockPicksResponse = {
      ...sampleSuccessResponse,
      data: {
        ...sampleSuccessResponse.data!,
        stock_picks: [
          ...sampleSuccessResponse.data!.stock_picks,
          {
            ticker: 'GOOGL',
            company_name: 'Alphabet Inc.',
            rationale: 'Search dominance and cloud growth',
            risk_level: 'medium'
          }
        ]
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedResponse
    });

    // Call refetch
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.data?.stock_picks).toHaveLength(3);
    });

    expect(result.current.data?.stock_picks[2].ticker).toBe('GOOGL');
  });

  it('should handle empty data gracefully', async () => {
    const emptyResponse: WeeklyStockPicksResponse = {
      success: true,
      data: {
        stock_picks: [],
        investment_themes: [],
        market_analysis: {
          current_environment: '',
          risk_factors: '',
          opportunities: ''
        }
      },
      metadata: {
        generated_at: '2025-01-30T12:00:00Z',
        week_of: '2025-01-27',
        cached: false
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyResponse
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.stock_picks).toEqual([]);
    expect(result.current.data?.investment_themes).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('should make correct API call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleSuccessResponse
    });

    renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/investment/weekly-picks', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
  });

  it('should handle malformed JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      }
    });

    const { result } = renderHook(() => useWeeklyStockPicks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Invalid JSON');
    expect(result.current.data).toBe(null);
  });
});
