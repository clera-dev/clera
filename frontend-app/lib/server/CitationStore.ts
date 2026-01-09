/**
 * CitationStore: Server-side persistence for chat message citations
 *
 * SECURITY: This module uses SUPABASE_SERVICE_ROLE_KEY for server-side writes
 * that bypass RLS. It should ONLY be imported by server-side API routes.
 */

import 'server-only';
import { createClient } from '@supabase/supabase-js';

interface StoreCitationsParams {
  runId: string;
  threadId: string;
  userId: string;
  citations: string[];
}

interface GetCitationsForThreadParams {
  threadId: string;
  userId: string;
}

interface CitationRecord {
  run_id: string;
  citations: string[];
}

export class CitationStore {
  private static supabaseClient: any = null;

  private static getClient() {
    if (!this.supabaseClient) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!serviceRoleKey || !supabaseUrl) {
        throw new Error('Missing Supabase credentials for CitationStore');
      }

      // Use service role key for server-side writes that bypass RLS
      this.supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    }
    return this.supabaseClient;
  }

  /**
   * Store citations for a specific run
   * Uses upsert to handle cases where citations are updated during streaming
   */
  static async storeCitations(params: StoreCitationsParams): Promise<void> {
    try {
      // Only store if there are actually citations to store
      if (!params.citations || params.citations.length === 0) {
        console.log('[CitationStore] No citations to store for run:', params.runId);
        return;
      }

      const client = this.getClient();

      console.log('[CitationStore] Storing citations for run:', params.runId, {
        threadId: params.threadId,
        citationCount: params.citations.length,
        citations: params.citations
      });

      const { error } = await client
        .from('message_citations')
        .upsert({
          run_id: params.runId,
          thread_id: params.threadId,
          user_id: params.userId,
          citations: params.citations,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'run_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('[CitationStore] Failed to store citations:', error);
      } else {
        console.log('[CitationStore] Successfully stored', params.citations.length, 'citations for run:', params.runId);
      }
    } catch (err) {
      console.error('[CitationStore] Failed to store citations:', err);
    }
  }

  /**
   * Get all citations for a thread, indexed by run_id
   * This is used when loading historical conversations
   */
  static async getCitationsForThread(params: GetCitationsForThreadParams): Promise<Map<string, string[]>> {
    try {
      const client = this.getClient();

      const { data, error } = await client
        .from('message_citations')
        .select('run_id, citations')
        .eq('thread_id', params.threadId)
        .eq('user_id', params.userId);

      if (error) {
        console.error('[CitationStore] Failed to get citations for thread:', error);
        return new Map();
      }

      // Build a map of run_id -> citations array
      const citationsMap = new Map<string, string[]>();
      if (data && Array.isArray(data)) {
        for (const record of data as CitationRecord[]) {
          if (record.run_id && record.citations && Array.isArray(record.citations)) {
            citationsMap.set(record.run_id, record.citations);
          }
        }
      }

      console.log('[CitationStore] Retrieved citations for thread:', params.threadId, {
        runCount: citationsMap.size,
        runs: Array.from(citationsMap.keys())
      });

      return citationsMap;
    } catch (err) {
      console.error('[CitationStore] Failed to get citations for thread:', err);
      return new Map();
    }
  }

  /**
   * Get citations for a specific run
   */
  static async getCitationsForRun(runId: string): Promise<string[]> {
    try {
      const client = this.getClient();

      const { data, error } = await client
        .from('message_citations')
        .select('citations')
        .eq('run_id', runId)
        .maybeSingle();

      if (error) {
        console.error('[CitationStore] Failed to get citations for run:', error);
        return [];
      }

      if (data && Array.isArray(data.citations)) {
        return data.citations;
      }

      return [];
    } catch (err) {
      console.error('[CitationStore] Failed to get citations for run:', err);
      return [];
    }
  }
}
