/**
 * ServerToolEventClient - Server-side client for tool activity persistence.
 * 
 * This client is designed to run in Next.js API routes and other server-side contexts.
 * It directly calls the backend API using environment variables since we're already
 * in a trusted server environment.
 * 
 * IMPORTANT: Only use this in server-side code. For client-side code, use ToolEventClient.
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

export class ServerToolEventClient {
  private static async makeRequest(request: ToolEventRequest, userToken?: string): Promise<boolean> {
    try {
      const backendUrl = process.env.BACKEND_API_URL;
      const apiKey = process.env.BACKEND_API_KEY;
      
      if (!backendUrl || !apiKey) {
        console.error('[ServerToolEventClient] Backend configuration missing');
        return false;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      };

      // Add user authorization header if provided
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }

      const response = await fetch(`${backendUrl}/api/tool-events/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        console.error(`[ServerToolEventClient] Request failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const result: ToolEventResponse = await response.json();
      if (!result.success) {
        console.error(`[ServerToolEventClient] Operation failed: ${result.message}`);
      }
      
      return result.success;
    } catch (error) {
      console.error('[ServerToolEventClient] Request exception:', error);
      return false;
    }
  }

  static async startRun(params: StartRunParams, userToken?: string): Promise<boolean> {
    return this.makeRequest({
      action: 'start_run',
      params: {
        run_id: params.runId,
        thread_id: params.threadId,
        user_id: params.userId,
        account_id: params.accountId,
      },
    }, userToken);
  }

  static async finalizeRun(params: FinalizeRunParams, userToken?: string): Promise<boolean> {
    return this.makeRequest({
      action: 'finalize_run',
      params: {
        run_id: params.runId,
        status: params.status,
      },
    }, userToken);
  }

  static async upsertToolStart(params: UpsertToolStartParams, userToken?: string): Promise<boolean> {
    return this.makeRequest({
      action: 'upsert_tool_start',
      params: {
        run_id: params.runId,
        tool_key: params.toolKey,
        tool_label: params.toolLabel,
        agent: params.agent || null,
        at: params.at || null,
      },
    }, userToken);
  }

  static async upsertToolComplete(params: UpsertToolCompleteParams, userToken?: string): Promise<boolean> {
    return this.makeRequest({
      action: 'upsert_tool_complete',
      params: {
        run_id: params.runId,
        tool_key: params.toolKey,
        status: params.status,
        at: params.at || null,
      },
    }, userToken);
  }

  static async cleanupOrphanedToolCalls(userToken?: string): Promise<number> {
    try {
      const response = await this.makeRequest({
        action: 'cleanup_orphaned',
      }, userToken);
      
      // For cleanup, we'd need to parse the actual response to get count
      // This is a simplified version that just returns success/failure
      return response ? 0 : -1;
    } catch {
      return -1;
    }
  }
}
