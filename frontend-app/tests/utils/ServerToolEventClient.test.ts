/**
 * Tests for ServerToolEventClient - Server-side tool event persistence
 */

import { ServerToolEventClient } from '@/utils/services/ServerToolEventClient';

// Mock fetch globally for Node.js testing environment
global.fetch = jest.fn();

describe('ServerToolEventClient', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables
    process.env.BACKEND_API_URL = 'http://localhost:8000';
    process.env.BACKEND_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.BACKEND_API_URL;
    delete process.env.BACKEND_API_KEY;
  });

  describe('startRun', () => {
    it('should successfully start a run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Run started' }),
      } as Response);

      const result = await ServerToolEventClient.startRun({
        runId: 'test-run-123',
        threadId: 'thread-456',
        userId: 'user-789',
        accountId: 'account-101',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tool-events/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': 'test-api-key',
          },
          body: JSON.stringify({
            action: 'start_run',
            params: {
              run_id: 'test-run-123',
              thread_id: 'thread-456',
              user_id: 'user-789',
              account_id: 'account-101',
            },
          }),
        }
      );
    });

    it('should include Authorization header when userToken provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Run started' }),
      } as Response);

      await ServerToolEventClient.startRun({
        runId: 'test-run-123',
        threadId: 'thread-456',
        userId: 'user-789',
        accountId: 'account-101',
      }, 'jwt-token-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tool-events/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        })
      );
    });

    it('should return false when backend configuration is missing', async () => {
      delete process.env.BACKEND_API_URL;

      const result = await ServerToolEventClient.startRun({
        runId: 'test-run-123',
        threadId: 'thread-456',
        userId: 'user-789',
        accountId: 'account-101',
      });

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const result = await ServerToolEventClient.startRun({
        runId: 'test-run-123',
        threadId: 'thread-456',
        userId: 'user-789',
        accountId: 'account-101',
      });

      expect(result).toBe(false);
    });

    it('should handle fetch exceptions gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await ServerToolEventClient.startRun({
        runId: 'test-run-123',
        threadId: 'thread-456',
        userId: 'user-789',
        accountId: 'account-101',
      });

      expect(result).toBe(false);
    });
  });

  describe('upsertToolStart', () => {
    it('should successfully record tool start', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Tool start recorded' }),
      } as Response);

      const result = await ServerToolEventClient.upsertToolStart({
        runId: 'test-run-123',
        toolKey: 'market_data',
        toolLabel: 'Market Data',
        agent: 'trading-agent',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tool-events/',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'upsert_tool_start',
            params: {
              run_id: 'test-run-123',
              tool_key: 'market_data',
              tool_label: 'Market Data',
              agent: 'trading-agent',
              at: null,
            },
          }),
        })
      );
    });
  });

  describe('upsertToolComplete', () => {
    it('should successfully record tool completion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Tool completion recorded' }),
      } as Response);

      const result = await ServerToolEventClient.upsertToolComplete({
        runId: 'test-run-123',
        toolKey: 'market_data',
        status: 'complete',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tool-events/',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'upsert_tool_complete',
            params: {
              run_id: 'test-run-123',
              tool_key: 'market_data',
              status: 'complete',
              at: null,
            },
          }),
        })
      );
    });
  });

  describe('finalizeRun', () => {
    it('should successfully finalize run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Run finalized' }),
      } as Response);

      const result = await ServerToolEventClient.finalizeRun({
        runId: 'test-run-123',
        status: 'complete',
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/tool-events/',
        expect.objectContaining({
          body: JSON.stringify({
            action: 'finalize_run',
            params: {
              run_id: 'test-run-123',
              status: 'complete',
            },
          }),
        })
      );
    });
  });
});
