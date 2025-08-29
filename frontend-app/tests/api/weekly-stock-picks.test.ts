/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/investment/weekly-picks/route';
import { WeeklyStockPicksResponse } from '@/lib/types/weekly-stock-picks';

// Mock Supabase - Define mock implementation first
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock the weekly stock picks generator
jest.mock('@/utils/services/weekly-stock-picks-generator', () => ({
  generateStockPicksForUser: jest.fn()
}));

// Mock Supabase service client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

// Mock Supabase objects
const mockSupabaseUser = {
  id: 'test-user-id',
  email: 'test@example.com'
};

const mockSupabaseAuth = {
  getUser: jest.fn().mockResolvedValue({
    data: { user: mockSupabaseUser },
    error: null
  })
};

const mockSupabaseFrom = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
  upsert: jest.fn().mockResolvedValue({ data: null, error: null }), // Add missing upsert method
  update: jest.fn().mockReturnThis()
};

const mockSupabase = {
  auth: mockSupabaseAuth,
  from: jest.fn().mockReturnValue(mockSupabaseFrom)
};

// Configure the mock after import
const { createClient } = require('@/utils/supabase/server');
(createClient as jest.Mock).mockResolvedValue(mockSupabase);

// Sample test data
const sampleWeeklyPicksData = {
  id: 'test-pick-id',
  user_id: 'test-user-id',
  stock_picks: [
    {
      ticker: 'NVDA',
      company_name: 'NVIDIA Corporation',
      rationale: 'AI infrastructure leader with strong growth potential and dominant market position.',
      risk_level: 'medium' as const
    },
    {
      ticker: 'MSFT',
      company_name: 'Microsoft Corporation', 
      rationale: 'Cloud computing giant with Azure growing 30% annually and strong AI integration.',
      risk_level: 'low' as const
    }
  ],
  investment_themes: [
    {
      title: 'AI Infrastructure',
      summary: 'Capitalize on explosive AI infrastructure demand',
      report: 'The AI revolution is creating unprecedented demand for specialized computing infrastructure...',
      relevant_tickers: ['NVDA', 'AMD', 'ARM'],
      theme_category: 'Technology'
    }
  ],
  market_analysis: {
    current_environment: 'Markets navigating AI optimism and economic uncertainty',
    risk_factors: 'Geopolitical tensions, inflation persistence',
    opportunities: 'AI infrastructure build-out, energy transition'
  },
  generated_at: '2025-01-30T12:00:00Z',
  week_of: '2025-01-27',
  model: 'sonar-deep-research',
  status: 'complete', // Add status field to match API expectations
  created_at: '2025-01-30T12:00:00Z',
  updated_at: '2025-01-30T12:00:00Z'
};

// Configure additional mocks after sample data
const { generateStockPicksForUser } = require('@/utils/services/weekly-stock-picks-generator');
const { createClient: createServiceClient } = require('@supabase/supabase-js');

// Mock the generation function to return sample data
(generateStockPicksForUser as jest.Mock).mockResolvedValue(sampleWeeklyPicksData);

// Mock the service client
(createServiceClient as jest.Mock).mockReturnValue(mockSupabase);

describe('/api/investment/weekly-picks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET endpoint', () => {
    it('should return personalized weekly picks for authenticated user', async () => {
      // Mock successful database query with complete status
      const completeData = {
        ...sampleWeeklyPicksData,
        status: 'complete' // Ensure status is complete to trigger direct return
      };
      
      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: completeData,
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.data).toBeDefined();
      expect(responseData.data?.stock_picks).toHaveLength(2);
      expect(responseData.data?.investment_themes).toHaveLength(1);
      expect(responseData.metadata?.generated_at).toBe(completeData.generated_at);
      expect(responseData.metadata?.week_of).toBe(completeData.week_of);
      expect(responseData.metadata?.cached).toBe(true);
    });

    it('should trigger on-demand generation for new user', async () => {
      // Mock no data found for both current week and most recent queries
      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: null,
        error: null
      });

      // Mock successful upsert for claiming generation slot
      mockSupabaseFrom.upsert.mockResolvedValue({
        data: null,
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.data).toBeDefined(); // Should have generated data
      expect(responseData.metadata?.generation_reason).toBe('new_user'); // Changed from fallback_reason
      expect(responseData.metadata?.status).toBe('complete');
    });

    it('should return error on database failure', async () => {
      // Mock database error
      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(500); // API returns 500 for database errors
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('Failed to fetch weekly stock picks');
    });

    it('should return 401 for unauthenticated user', async () => {
      // Mock authentication failure
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No user found' }
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData.error).toBe('User not authenticated');
    });

    it('should handle malformed data gracefully', async () => {
      // Mock malformed data with complete status to avoid generation
      const malformedData = {
        ...sampleWeeklyPicksData,
        stock_picks: 'invalid-json', // This should be an array
        investment_themes: null,
        status: 'complete' // Ensure status is complete to avoid generation
      };

      // Ensure authentication is mocked for this test
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null
      });

      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: malformedData,
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(true);
      // Should return the malformed data and let the frontend handle gracefully
      expect(responseData.data).toBeDefined();
      expect(responseData.data?.stock_picks).toBe('invalid-json');
      expect(responseData.data?.investment_themes).toBeNull();
    });
  });

  describe('Data validation', () => {
    beforeEach(() => {
      // Reset mocks and ensure authentication succeeds for data validation tests
      jest.clearAllMocks();
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null
      });
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalData = {
        ...sampleWeeklyPicksData,
        stock_picks: [
          {
            ticker: 'AAPL',
            company_name: 'Apple Inc.',
            rationale: 'Strong iPhone sales and services growth',
            risk_level: 'medium' as const
          }
        ],
        market_analysis: undefined, // Optional field
        status: 'complete' // Ensure status is complete to avoid generation
      };

      // Mock data for current week to avoid triggering generation
      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: minimalData,
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(true);
      expect(responseData.data?.stock_picks[0].ticker).toBe('AAPL');
    });

    it('should validate required fields exist', async () => {
      // Mock data with complete status to avoid triggering generation
      const completeData = {
        ...sampleWeeklyPicksData,
        status: 'complete'
      };
      
      mockSupabaseFrom.maybeSingle.mockResolvedValue({
        data: completeData,
        error: null
      });

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      
      // Validate required stock pick fields
      const firstStock = responseData.data?.stock_picks[0];
      expect(firstStock?.ticker).toBeDefined();
      expect(firstStock?.company_name).toBeDefined();
      expect(firstStock?.rationale).toBeDefined();
      
      // Validate required investment theme fields
      const firstTheme = responseData.data?.investment_themes[0];
      expect(firstTheme?.title).toBeDefined();
      expect(firstTheme?.summary).toBeDefined();
      expect(firstTheme?.report).toBeDefined();
      expect(firstTheme?.relevant_tickers).toBeDefined();
      expect(Array.isArray(firstTheme?.relevant_tickers)).toBe(true);
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      // Reset mocks and ensure authentication succeeds for error handling tests
      jest.clearAllMocks();
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null
      });
    });


    it('should handle database timeout gracefully', async () => {
      // Mock database timeout
      mockSupabaseFrom.maybeSingle.mockRejectedValue(new Error('Connection timeout'));

      const request = new NextRequest('http://localhost:3000/api/investment/weekly-picks');
      const response = await GET(request);
      
      expect(response.status).toBe(500); // API returns 500 for service errors
      
      const responseData: WeeklyStockPicksResponse = await response.json();
      expect(responseData.success).toBe(false);
      expect(responseData.error).toContain('Service temporarily unavailable');
    });
  });
});
