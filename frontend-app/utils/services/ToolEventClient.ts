/**
 * ToolEventClient - Frontend client for tool activity persistence.
 * 
 * Follows the established API proxy pattern by calling Next.js API routes
 * instead of directly connecting to the backend. This ensures proper
 * authentication, authorization, and secure header handling.
 */

export type ToolStatus = 'running' | 'complete' | 'error';

export interface StartRunParams {
  runId: string;
  threadId: string;
  userId: string;
  accountId: string;
}

export interface FinalizeRunParams {
  runId: string;
  status: 'complete' | 'error';
}

export interface UpsertToolStartParams {
  runId: string;
  toolKey: string;
  toolLabel: string;
  agent?: string;
  at?: string;
}

export interface UpsertToolCompleteParams {
  runId: string;
  toolKey: string;
  status: 'complete' | 'error';
  at?: string;
}

interface ToolEventRequest {
  action: 'start_run' | 'finalize_run' | 'upsert_tool_start' | 'upsert_tool_complete' | 'cleanup_orphaned';
  params?: any;
}

interface ToolEventResponse {
  success: boolean;
  message: string;
  data?: any;
}

export class ToolEventClient {
  private static async makeRequest(request: ToolEventRequest): Promise<boolean> {
    try {
      // Call Next.js API route instead of backend directly
      // This follows the established proxy pattern and ensures proper auth
      const response = await fetch('/api/tool-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        console.error(`[ToolEventClient] Request failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const result: ToolEventResponse = await response.json();
      if (!result.success) {
        console.error(`[ToolEventClient] Operation failed: ${result.message}`);
      }
      
      return result.success;
    } catch (error) {
      console.error('[ToolEventClient] Request exception:', error);
      return false;
    }
  }

  static async startRun(params: StartRunParams): Promise<boolean> {
    return this.makeRequest({
      action: 'start_run',
      params: {
        run_id: params.runId,
        thread_id: params.threadId,
        user_id: params.userId,
        account_id: params.accountId,
      },
    });
  }

  static async finalizeRun(params: FinalizeRunParams): Promise<boolean> {
    return this.makeRequest({
      action: 'finalize_run',
      params: {
        run_id: params.runId,
        status: params.status,
      },
    });
  }

  static async upsertToolStart(params: UpsertToolStartParams): Promise<boolean> {
    return this.makeRequest({
      action: 'upsert_tool_start',
      params: {
        run_id: params.runId,
        tool_key: params.toolKey,
        tool_label: params.toolLabel,
        agent: params.agent || null,
        at: params.at || null,
      },
    });
  }

  static async upsertToolComplete(params: UpsertToolCompleteParams): Promise<boolean> {
    return this.makeRequest({
      action: 'upsert_tool_complete',
      params: {
        run_id: params.runId,
        tool_key: params.toolKey,
        status: params.status,
        at: params.at || null,
      },
    });
  }

  static async cleanupOrphanedToolCalls(): Promise<number> {
    try {
      const response = await this.makeRequest({
        action: 'cleanup_orphaned',
      });
      
      // For cleanup, we'd need to parse the actual response to get count
      // This is a simplified version that just returns success/failure
      return response ? 0 : -1;
    } catch {
      return -1;
    }
  }
}
