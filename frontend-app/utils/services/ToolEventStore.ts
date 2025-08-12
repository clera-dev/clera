import { createClient as createServerSupabase } from '@/utils/supabase/server';

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
  at?: string | Date;
}

export interface UpsertToolCompleteParams {
  runId: string;
  toolKey: string;
  status: 'complete' | 'error';
  at?: string | Date;
}

/**
 * ToolEventStore persists chat run and tool call lifecycle events to Supabase.
 * It never throws to the caller (logs and returns quietly) to avoid interfering with SSE streaming.
 */
export class ToolEventStore {
  private static async getClient() {
    return await createServerSupabase();
  }

  static async startRun(params: StartRunParams): Promise<void> {
    try {
      const supabase = await this.getClient();
      const { error } = await supabase
        .from('chat_runs')
        .upsert({
          id: params.runId,
          thread_id: params.threadId,
          user_id: params.userId,
          account_id: params.accountId,
          status: 'running',
        }, { onConflict: 'id' });
      if (error) console.error('[ToolEventStore.startRun] upsert error', error);
    } catch (e) {
      console.error('[ToolEventStore.startRun] exception', e);
    }
  }

  static async finalizeRun(params: FinalizeRunParams): Promise<void> {
    try {
      const supabase = await this.getClient();
      
      // Update the run status
      const { error } = await supabase
        .from('chat_runs')
        .update({ status: params.status, ended_at: new Date().toISOString() })
        .eq('id', params.runId);
      if (error) console.error('[ToolEventStore.finalizeRun] update error', error);

      // When a run is finalized successfully, mark any remaining 'running' tool calls as complete
      // This ensures data consistency for interrupted or aborted streams
      if (params.status === 'complete') {
        const { error: toolUpdateError } = await supabase
          .from('chat_tool_calls')
          .update({ 
            status: 'complete',
            completed_at: new Date().toISOString()
          })
          .eq('run_id', params.runId)
          .eq('status', 'running');
        
        if (toolUpdateError) {
          console.error('[ToolEventStore.finalizeRun] tool completion error', toolUpdateError);
        }
      }
    } catch (e) {
      console.error('[ToolEventStore.finalizeRun] exception', e);
    }
  }

  static async upsertToolStart(params: UpsertToolStartParams): Promise<void> {
    try {
      const supabase = await this.getClient();
      const startedAt = params.at ? new Date(params.at).toISOString() : new Date().toISOString();
      const { error } = await supabase
        .from('chat_tool_calls')
        .insert({
          run_id: params.runId,
          tool_key: params.toolKey,
          tool_label: params.toolLabel,
          agent: params.agent || null,
          status: 'running' as ToolStatus,
          started_at: startedAt,
        });
      if (error && !String(error.message).includes('duplicate')) {
        console.error('[ToolEventStore.upsertToolStart] insert error', error);
      }
    } catch (e) {
      console.error('[ToolEventStore.upsertToolStart] exception', e);
    }
  }

  static async upsertToolComplete(params: UpsertToolCompleteParams): Promise<void> {
    try {
      const supabase = await this.getClient();
      const completedAt = params.at ? new Date(params.at).toISOString() : new Date().toISOString();

      // Update the latest running record for this tool in this run
      const { data, error: selErr } = await supabase
        .from('chat_tool_calls')
        .select('id')
        .eq('run_id', params.runId)
        .eq('tool_key', params.toolKey)
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1);
      if (selErr) {
        console.error('[ToolEventStore.upsertToolComplete] select error', selErr);
      }

      if (data && data.length > 0) {
        const { error: updErr } = await supabase
          .from('chat_tool_calls')
          .update({ status: params.status as ToolStatus, completed_at: completedAt })
          .eq('id', data[0].id);
        if (updErr) console.error('[ToolEventStore.upsertToolComplete] update error', updErr);
      } else {
        // No running row found; insert a completed record to avoid data loss
        const { error: insErr } = await supabase
          .from('chat_tool_calls')
          .insert({
            run_id: params.runId,
            tool_key: params.toolKey,
            tool_label: params.toolKey,
            status: params.status as ToolStatus,
            started_at: completedAt,
            completed_at: completedAt,
          });
        if (insErr) console.error('[ToolEventStore.upsertToolComplete] insert fallback error', insErr);
      }
    } catch (e) {
      console.error('[ToolEventStore.upsertToolComplete] exception', e);
    }
  }

  /**
   * Utility function to clean up orphaned 'running' tool calls for completed runs.
   * This can be called manually to fix data inconsistencies.
   */
  static async cleanupOrphanedToolCalls(): Promise<void> {
    try {
      const supabase = await this.getClient();
      
      // First, get all completed run IDs
      const { data: completedRuns, error: runsError } = await supabase
        .from('chat_runs')
        .select('id')
        .eq('status', 'complete');

      if (runsError) {
        console.error('[ToolEventStore.cleanupOrphanedToolCalls] runs select error', runsError);
        return;
      }

      if (!completedRuns || completedRuns.length === 0) {
        console.log('[ToolEventStore.cleanupOrphanedToolCalls] No completed runs found');
        return;
      }

      const completedRunIds = completedRuns.map(r => r.id);

      // Find all tool calls that are still 'running' but belong to completed runs
      const { data: orphanedTools, error: selectError } = await supabase
        .from('chat_tool_calls')
        .select('id, run_id')
        .eq('status', 'running')
        .in('run_id', completedRunIds);

      if (selectError) {
        console.error('[ToolEventStore.cleanupOrphanedToolCalls] select error', selectError);
        return;
      }

      if (orphanedTools && orphanedTools.length > 0) {
        console.log(`[ToolEventStore.cleanupOrphanedToolCalls] Found ${orphanedTools.length} orphaned tool calls, marking as complete`);
        
        const { error: updateError } = await supabase
          .from('chat_tool_calls')
          .update({ 
            status: 'complete',
            completed_at: new Date().toISOString()
          })
          .in('id', orphanedTools.map(t => t.id));

        if (updateError) {
          console.error('[ToolEventStore.cleanupOrphanedToolCalls] update error', updateError);
        } else {
          console.log(`[ToolEventStore.cleanupOrphanedToolCalls] Successfully cleaned up ${orphanedTools.length} orphaned tool calls`);
        }
      } else {
        console.log('[ToolEventStore.cleanupOrphanedToolCalls] No orphaned tool calls found');
      }
    } catch (e) {
      console.error('[ToolEventStore.cleanupOrphanedToolCalls] exception', e);
    }
  }
}


