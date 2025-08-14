/**
 * ToolEventStore: Server-side only persistence for chat tool activities
 *
 * SECURITY: This module uses SUPABASE_SERVICE_ROLE_KEY for server-side writes
 * that bypass RLS. It should ONLY be imported by server-side API routes.
 */

import 'server-only';
import { createClient } from '@supabase/supabase-js';

interface StartRunParams {
  runId: string;
  threadId: string;
  userId: string;
  accountId: string;
}

interface ToolStartParams {
  runId: string;
  toolKey: string;
  toolLabel: string;
  agent?: string;
}

interface ToolCompleteParams {
  runId: string;
  toolKey: string;
  status?: 'complete' | 'error';
}

interface FinalizeRunParams {
  runId: string;
  status: 'complete' | 'error';
}

export class ToolEventStore {
  private static supabaseClient: any = null;

  private static getClient() {
    if (!this.supabaseClient) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      
      if (!serviceRoleKey || !supabaseUrl) {
        throw new Error('Missing Supabase credentials for ToolEventStore');
      }
      
      // Use service role key for server-side writes that bypass RLS
      this.supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    }
    return this.supabaseClient;
  }

  private static toIsoOrNow(input?: string | Date): string {
    try {
      if (!input) return new Date().toISOString();
      const date = new Date(input);
      if (isNaN(date.getTime())) return new Date().toISOString();
      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  static async startRun(params: StartRunParams): Promise<void> {
    try {
      const client = this.getClient();
      const { error } = await client
        .from('chat_runs')
        .upsert({
          id: params.runId,
          thread_id: params.threadId,
          user_id: params.userId,
          account_id: params.accountId,
          started_at: new Date().toISOString(),
          status: 'running'
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error('[ToolEventStore] Failed to start run:', error);
      }
    } catch (err) {
      console.error('[ToolEventStore] Failed to start run:', err);
    }
  }

  static async upsertToolStart(params: ToolStartParams): Promise<void> {
    try {
      const client = this.getClient();
      const now = this.toIsoOrNow();
      
      const { error } = await client
        .from('chat_tool_calls')
        .upsert({
          run_id: params.runId,
          tool_key: params.toolKey,
          tool_label: params.toolLabel,
          agent: params.agent || null,
          started_at: now,
          status: 'running'
        }, {
          onConflict: 'run_id,tool_key',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error('[ToolEventStore] Failed to upsert tool start:', error);
      }
    } catch (err) {
      console.error('[ToolEventStore] Failed to upsert tool start:', err);
    }
  }

  static async upsertToolComplete(params: ToolCompleteParams): Promise<void> {
    try {
      const client = this.getClient();
      const now = this.toIsoOrNow();
      const status = params.status || 'complete';
      
      // Try to update existing running tool call
      const { data: existing, error: selectError } = await client
        .from('chat_tool_calls')
        .select('*')
        .eq('run_id', params.runId)
        .eq('tool_key', params.toolKey)
        .eq('status', 'running')
        .limit(1)
        .maybeSingle();
      
      if (selectError) {
        console.error('[ToolEventStore] Failed to query existing tool call:', selectError);
        return;
      }
      
      if (existing) {
        // Update existing running tool call
        const { error: updateError } = await client
          .from('chat_tool_calls')
          .update({
            status,
            completed_at: now
          })
          .eq('id', existing.id);
          
        if (updateError) {
          console.error('[ToolEventStore] Failed to update tool completion:', updateError);
        }
      } else {
        // No running tool call found, upsert a new one
        const { error: upsertError } = await client
          .from('chat_tool_calls')
          .upsert({
            run_id: params.runId,
            tool_key: params.toolKey,
            tool_label: params.toolKey, // fallback if no label provided
            started_at: now,
            completed_at: now,
            status
          }, {
            onConflict: 'run_id,tool_key',
            ignoreDuplicates: false
          });
          
        if (upsertError) {
          console.error('[ToolEventStore] Failed to upsert tool completion:', upsertError);
        }
      }
    } catch (err) {
      console.error('[ToolEventStore] Failed to complete tool:', err);
    }
  }

  static async finalizeRun(params: FinalizeRunParams): Promise<void> {
    try {
      const client = this.getClient();
      const now = this.toIsoOrNow();
      
      // Update run status
      const { error: runError } = await client
        .from('chat_runs')
        .update({
          status: params.status,
          ended_at: now
        })
        .eq('id', params.runId);
      
      if (runError) {
        console.error('[ToolEventStore] Failed to finalize run:', runError);
      }
      
      // If run failed, mark any remaining running tool calls as error
      if (params.status === 'error') {
        const { error: toolError } = await client
          .from('chat_tool_calls')
          .update({
            status: 'error',
            completed_at: now
          })
          .eq('run_id', params.runId)
          .eq('status', 'running');
          
        if (toolError) {
          console.error('[ToolEventStore] Failed to mark running tools as error:', toolError);
        }
      }
    } catch (err) {
      console.error('[ToolEventStore] Failed to finalize run:', err);
    }
  }
}


