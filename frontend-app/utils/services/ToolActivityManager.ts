/**
 * ToolActivityManager: Dedicated service for managing tool activity lifecycle
 * 
 * Extracted from SecureChatClientImpl to follow Single Responsibility Principle.
 * Handles tool activity state management, persistence integration, and normalization.
 */

import { ToolActivity } from '@/types/chat';

export interface ToolActivityState {
  toolActivities: ToolActivity[];
}

export class ToolActivityManager {
  private activities: ToolActivity[] = [];
  private currentRunId: string | null = null;
  private stateUpdateCallback: ((activities: ToolActivity[]) => void) | null = null;

  constructor(initialActivities: ToolActivity[] = []) {
    this.activities = [...initialActivities];
  }

  /**
   * Set callback to notify when activities state changes
   */
  setStateUpdateCallback(callback: (activities: ToolActivity[]) => void) {
    this.stateUpdateCallback = callback;
  }

  /**
   * Set the current run ID for new activities
   */
  setCurrentRunId(runId: string | null) {
    this.currentRunId = runId;
  }

  /**
   * Get current activities (defensive copy)
   */
  getActivities(): ToolActivity[] {
    return [...this.activities];
  }

  /**
   * Update activities and notify subscribers
   */
  private updateActivities(newActivities: ToolActivity[]) {
    this.activities = [...newActivities];
    this.stateUpdateCallback?.(this.activities);
  }

  /**
   * Safely merge server-persisted tool activities into state
   * Only appends activities for runs not already present, to avoid duplicating current in-memory runs
   */
  mergePersistedActivities(activities: ToolActivity[]) {
    if (!Array.isArray(activities) || activities.length === 0) return;
    
    // Deduplicate at the activity level (runId + toolName + startedAt)
    const existingKeys = new Set(
      this.activities.map(a => `${a.runId || 'unknown'}|${a.toolName}|${a.startedAt}`)
    );
    
    const incoming = activities.filter(a => {
      if (!a) return false;
      const key = `${a.runId || 'unknown'}|${a.toolName}|${a.startedAt}`;
      return !existingKeys.has(key);
    });
    
    if (incoming.length === 0) return;
    
    this.updateActivities([...this.activities, ...incoming]);
  }

  /**
   * Add a new tool start activity
   */
  addToolStart(toolName: string) {
    const normalized = this.normalizeToolLabel(toolName);
    const runId = this.currentRunId || 'unknown';
    
    // Enhanced duplicate prevention: check for existing activity by tool name and runId
    // Also check for very recent activities (within 1 second) to catch rapid duplicates
    const now = Date.now();
    const existingActivity = this.activities.find((a: ToolActivity) =>
      a.runId === runId && a.toolName === normalized && (now - a.startedAt < 1000)
    );
    
    if (existingActivity) {
      // Don't add duplicates
      return;
    }
    
    // Before adding new running activity, mark any other running ones as complete
    const updatedActivities = this.activities.map<ToolActivity>((a: ToolActivity) => {
      if (a.runId === runId && a.status === 'running') {
        return { ...a, status: 'complete' as const, completedAt: Date.now() };
      }
      return a;
    });

    // Now create and add the new activity
    const activity: ToolActivity = {
      id: `${normalized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName: normalized,
      status: 'running',
      startedAt: Date.now(),
      runId,
    };
    
    this.updateActivities([...updatedActivities, activity]);
  }

  /**
   * Mark a tool as complete
   */
  markToolComplete(toolName: string) {
    const normalized = this.normalizeToolLabel(toolName);
    const activities: ToolActivity[] = [...this.activities];
    const runId = this.currentRunId || 'unknown';
    
    // Find the latest running activity for this tool
    for (let i = activities.length - 1; i >= 0; i--) {
      const a = activities[i];
      if (a.toolName === normalized && a.status === 'running' && a.runId === runId) {
        activities[i] = { ...a, status: 'complete' as const, completedAt: Date.now() };
        this.updateActivities(activities);
        return;
      }
    }
    
    // If none running, add a completed entry for traceability
    const activity: ToolActivity = {
      id: `${normalized}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName: normalized,
      status: 'complete',
      startedAt: Date.now(),
      completedAt: Date.now(),
      runId,
    };
    
    this.updateActivities([...activities, activity]);
  }

  /**
   * Complete all running activities for the current run
   */
  completeAllRunningForCurrentRun() {
    const runId = this.currentRunId;
    if (!runId) return;
    
    const updated = this.activities.map<ToolActivity>((a: ToolActivity) => {
      if (a.runId === runId && a.status === 'running') {
        return { ...a, status: 'complete' as const, completedAt: Date.now() };
      }
      return a;
    });
    
    this.updateActivities(updated);
  }

  /**
   * Add explicit run completion marker so TimelineBuilder can add "Done" only at the right time
   */
  markRunCompleted(): void {
    const runId = this.currentRunId || 'unknown';
    
    // Avoid duplicate markers for a run
    const alreadyMarked = this.activities.some((a: ToolActivity) => 
      a.runId === runId && a.toolName === '__run_completed__'
    );
    
    if (alreadyMarked) return;
    
    const activity: ToolActivity = {
      id: `run-complete-${Date.now()}`,
      toolName: '__run_completed__',
      status: 'complete',
      startedAt: Date.now(),
      completedAt: Date.now(),
      runId,
    };
    
    this.updateActivities([...this.activities, activity]);
  }

  /**
   * Fetch persisted tool activities for a thread and merge into state. Returns sorted runIds.
   */
  async fetchAndHydrateToolActivities(threadId: string, accountId: string | undefined): Promise<string[]> {
    try {
      const params = new URLSearchParams({ thread_id: threadId });
      // Only include account_id if it's defined and not null
      if (accountId && accountId !== 'undefined' && accountId !== 'null') {
        params.set('account_id', accountId);
      }
      const res = await fetch(`/api/conversations/get-tool-activities?${params.toString()}`, { method: 'GET' });
      if (!res.ok) return [];
      const data = await res.json();
      const runs = Array.isArray(data.runs) ? data.runs : [];

      // Convert persisted runs into tool activity items in chronological order
      const persistedActivities: ToolActivity[] = runs.flatMap((run: any) =>
        (run.tool_calls || []).map((t: any) => {
          const runIsComplete = run.status === 'complete' || run.ended_at;
          const activityStatus = runIsComplete ? 'complete' : (t.status === 'complete' ? 'complete' : 'running');

          const startedAtMs = (() => {
            const d = t?.started_at ? new Date(t.started_at) : new Date();
            const ms = d.getTime();
            return Number.isNaN(ms) ? Date.now() : ms;
          })();
          
          const completedAtMs = (() => {
            if (!t?.completed_at) return undefined;
            const d = new Date(t.completed_at);
            const ms = d.getTime();
            return Number.isNaN(ms) ? undefined : ms;
          })();

          return {
            id: `${run.run_id}-${t.tool_key}-${t.started_at}`,
            toolName: t.tool_label || t.tool_key,
            status: activityStatus as 'running' | 'complete' | 'error',
            startedAt: startedAtMs,
            completedAt: completedAtMs,
            runId: run.run_id,
          } as ToolActivity;
        })
      );

      const currentActivities = this.activities;
      const newPersistedActivities = persistedActivities.filter((persisted: any) =>
        !currentActivities.some((c: any) => c.id === persisted.id)
      );
      
      const mergedActivities = [...currentActivities, ...newPersistedActivities];
      this.mergePersistedActivities(mergedActivities);

      const sortedRuns = [...runs].sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      const runIds: string[] = sortedRuns.map((r: any) => r.run_id);
      return runIds;
    } catch (err) {
      console.error('[ToolActivityManager] Failed to fetch persisted tool activities', err);
      return [];
    }
  }

  /**
   * Normalize tool label for consistent mapping
   */
  private normalizeToolLabel(name: string): string {
    if (!name) return 'tool';
    // Return the raw tool key in lower snake_case for consistent mapping by ToolNameMapper
    return String(name).trim().toLowerCase();
  }
}
