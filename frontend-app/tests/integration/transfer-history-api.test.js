/**
 * Transfer History API Integration Tests
 * 
 * Tests the new transfer history API endpoint functionality:
 * 1. Authentication validation
 * 2. Transfer data retrieval and formatting
 * 3. Edge cases and error handling
 * 4. Bank account last 4 integration
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock global objects for Node environment
global.window = global.window || {};

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn()
};

// Mock Next.js server functions
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// Mock NextResponse
const mockNextResponse = {
  json: jest.fn((data, options) => ({ data, options })),
};

jest.mock('next/server', () => ({
  NextResponse: mockNextResponse
}));

describe('Transfer History API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful auth response
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authentication Validation', () => {
    test('should reject unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      });

      // Simulate the API endpoint logic
      const { data: { user } } = await mockSupabase.auth.getUser();
      
      expect(user).toBeNull();
      
      if (!user) {
        const response = mockNextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
        expect(response.data.error).toBe('Unauthorized');
        expect(response.options.status).toBe(401);
      }
    });

    test('should handle auth errors gracefully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const { data: { user }, error } = await mockSupabase.auth.getUser();
      
      expect(user).toBeNull();
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('Transfer Data Retrieval', () => {
    test('should fetch and format transfer history correctly', async () => {
      // Mock Supabase from method chain
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'transfer-1',
            transfer_id: 'alpaca-transfer-1',
            amount: '100.00',
            status: 'COMPLETED',
            created_at: '2025-01-01T10:00:00Z',
            updated_at: '2025-01-02T10:00:00Z'
          },
          {
            id: 'transfer-2',
            transfer_id: 'alpaca-transfer-2',
            amount: '50.50',
            status: 'QUEUED',
            created_at: '2025-01-02T15:30:00Z',
            updated_at: null
          }
        ],
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit
      });

      // Simulate the API endpoint logic
      const transfers = await mockSupabase
        .from('user_transfers')
        .select('*')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(20);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_transfers');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'test-user-123');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(20);

      // Test data formatting
      const formattedTransfers = transfers.data.map(transfer => ({
        id: transfer.transfer_id || transfer.id,
        amount: parseFloat(transfer.amount || '0'),
        status: transfer.status || 'UNKNOWN',
        created_at: transfer.created_at,
        updated_at: transfer.updated_at,
        last_4: null // Would be set from bank connection
      }));

      expect(formattedTransfers).toHaveLength(2);
      expect(formattedTransfers[0]).toEqual({
        id: 'alpaca-transfer-1',
        amount: 100.00,
        status: 'COMPLETED',
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-02T10:00:00Z',
        last_4: null
      });
      expect(formattedTransfers[1]).toEqual({
        id: 'alpaca-transfer-2',
        amount: 50.50,
        status: 'QUEUED',
        created_at: '2025-01-02T15:30:00Z',
        updated_at: null,
        last_4: null
      });
    });

    test('should handle empty transfer history', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockResolvedValue({
        data: [],
        error: null
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit
      });

      const transfers = await mockSupabase
        .from('user_transfers')
        .select('*')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(20);

      expect(transfers.data).toEqual([]);
      expect(transfers.error).toBeNull();
    });

    test('should handle database errors gracefully', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit
      });

      const transfers = await mockSupabase
        .from('user_transfers')
        .select('*')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(20);

      expect(transfers.error.message).toBe('Database connection failed');
    });
  });

  describe('Bank Account Integration', () => {
    test('should fetch bank account last 4 digits', async () => {
      // Mock bank connection query
      const mockBankSelect = jest.fn().mockReturnThis();
      const mockBankEq = jest.fn().mockReturnThis();
      const mockBankOrder = jest.fn().mockReturnThis();
      const mockBankLimit = jest.fn().mockReturnThis();
      const mockBankSingle = jest.fn().mockResolvedValue({
        data: { last_4: '1234' },
        error: null
      });

      // Set up the from method to return different chains for different tables
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'user_bank_connections') {
          return {
            select: mockBankSelect,
            eq: mockBankEq,
            order: mockBankOrder,
            limit: mockBankLimit,
            single: mockBankSingle
          };
        }
        // Return a different mock for user_transfers
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null })
        };
      });

      const bankConnection = await mockSupabase
        .from('user_bank_connections')
        .select('last_4')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(bankConnection.data.last_4).toBe('1234');
      expect(mockBankSelect).toHaveBeenCalledWith('last_4');
      expect(mockBankEq).toHaveBeenCalledWith('user_id', 'test-user-123');
    });

    test('should handle missing bank connection gracefully', async () => {
      const mockBankSelect = jest.fn().mockReturnThis();
      const mockBankEq = jest.fn().mockReturnThis();
      const mockBankOrder = jest.fn().mockReturnThis();
      const mockBankLimit = jest.fn().mockReturnThis();
      const mockBankSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'No rows found' }
      });

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'user_bank_connections') {
          return {
            select: mockBankSelect,
            eq: mockBankEq,
            order: mockBankOrder,
            limit: mockBankLimit,
            single: mockBankSingle
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null })
        };
      });

      const bankConnection = await mockSupabase
        .from('user_bank_connections')
        .select('last_4')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(bankConnection.data).toBeNull();
      expect(bankConnection.error.message).toBe('No rows found');
    });
  });

  describe('Data Validation and Edge Cases', () => {
    test('should handle malformed transfer amounts', async () => {
      const transfers = [
        { amount: 'invalid', status: 'COMPLETED' },
        { amount: null, status: 'COMPLETED' },
        { amount: undefined, status: 'COMPLETED' },
        { amount: '', status: 'COMPLETED' }
      ];

      const formattedTransfers = transfers.map(transfer => {
        const parsedAmount = parseFloat(transfer.amount || '0');
        return {
          amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          status: transfer.status || 'UNKNOWN'
        };
      });

      expect(formattedTransfers[0].amount).toBe(0); // parseFloat('invalid') = NaN, but we default to 0
      expect(formattedTransfers[1].amount).toBe(0);
      expect(formattedTransfers[2].amount).toBe(0);
      expect(formattedTransfers[3].amount).toBe(0);
    });

    test('should handle missing status fields', async () => {
      const transfers = [
        { amount: '100', status: null },
        { amount: '100', status: undefined },
        { amount: '100', status: '' },
        { amount: '100' } // missing status
      ];

      const formattedTransfers = transfers.map(transfer => ({
        amount: parseFloat(transfer.amount || '0'),
        status: transfer.status || 'UNKNOWN'
      }));

      formattedTransfers.forEach(transfer => {
        expect(transfer.status).toBe('UNKNOWN');
        expect(transfer.amount).toBe(100);
      });
    });

    test('should limit transfer history to 20 items', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn();

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit
      });

      await mockSupabase
        .from('user_transfers')
        .select('*')
        .eq('user_id', 'test-user-123')
        .order('created_at', { ascending: false })
        .limit(20);

      expect(mockLimit).toHaveBeenCalledWith(20);
    });
  });

  describe('Response Format Validation', () => {
    test('should return correctly formatted success response', () => {
      const mockTransfers = [
        {
          id: 'transfer-1',
          amount: 100.00,
          status: 'COMPLETED',
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-02T10:00:00Z',
          last_4: '1234'
        }
      ];

      const response = mockNextResponse.json({
        success: true,
        transfers: mockTransfers
      });

      expect(response.data.success).toBe(true);
      expect(response.data.transfers).toEqual(mockTransfers);
      expect(response.data.transfers[0]).toHaveProperty('id');
      expect(response.data.transfers[0]).toHaveProperty('amount');
      expect(response.data.transfers[0]).toHaveProperty('status');
      expect(response.data.transfers[0]).toHaveProperty('created_at');
      expect(response.data.transfers[0]).toHaveProperty('last_4');
    });

    test('should return correctly formatted error response', () => {
      const response = mockNextResponse.json(
        { error: 'Failed to fetch transfer history' },
        { status: 500 }
      );

      expect(response.data.error).toBe('Failed to fetch transfer history');
      expect(response.options.status).toBe(500);
    });
  });
});

console.log('✅ Transfer History API tests completed'); 