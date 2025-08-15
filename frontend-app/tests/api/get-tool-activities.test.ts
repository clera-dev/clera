// Basic contract test: ensures route returns JSON structure.
// Note: We mock Supabase and auth since this is a unit-level API test.

jest.mock('@/utils/api/conversation-auth', () => ({
  ConversationAuthService: {
    authenticateAndAuthorize: jest.fn(async () => ({ success: true, context: { user: { id: 'user_1' } } })),
  },
}));

jest.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    from: function (table: string) {
      const api: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };
      if (table === 'chat_runs') {
        api.select.mockReturnThis();
        api.order.mockReturnThis();
        api.limit.mockResolvedValue({ data: [{ id: 'run_1', started_at: '2025-01-01T00:00:00Z', ended_at: null, status: 'running' }], error: null });
      } else if (table === 'chat_tool_calls') {
        api.order.mockResolvedValue({ data: [
          { run_id: 'run_1', tool_key: 'get_portfolio_summary', tool_label: 'Get Portfolio Summary', agent: 'portfolio_management_agent', status: 'complete', started_at: '2025-01-01T00:00:02Z', completed_at: '2025-01-01T00:00:03Z', metadata: null }
        ], error: null });
      }
      return api;
    }
  })
}));

import { GET } from '@/app/api/conversations/get-tool-activities/route';

// Minimal polyfill for NextRequest usage in route
// Next.js bundles its own Request; to avoid conflicts, we mock global.
beforeAll(() => {
  if (!(global as any).Request) {
    const { Request } = require('node-fetch');
    (global as any).Request = Request;
  }
});

describe('GET tool activities API', () => {
  test('returns grouped runs with tool calls', async () => {
    const req = new (global as any).Request('http://localhost/api?thread_id=thread_1&account_id=acct', { method: 'GET' });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.runs)).toBe(true);
    expect(json.runs[0].tool_calls.length).toBeGreaterThan(0);
  });
});


