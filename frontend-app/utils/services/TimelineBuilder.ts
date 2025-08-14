/**
 * TimelineBuilder - Constructs timeline steps from tool activities
 * 
 * This service follows the Single Responsibility Principle by handling only
 * the logic for building timeline data structures from raw activity data.
 * It's designed to be testable, configurable, and independent of UI rendering.
 */

import { IToolNameMapper, defaultToolMapper } from './ToolNameMapper';
import { ToolActivity, TimelineStep } from '@/types/chat';

export interface TimelineConfig {
  /** Whether to add a final "Done" step when activities are complete */
  addDoneStep: boolean;
  /** Whether to sort steps chronologically */
  sortChronologically: boolean;
  /** Custom tool name mapper */
  toolMapper?: IToolNameMapper;
  /** Minimum number of activities required to show timeline */
  minimumActivities: number;
}

export class TimelineBuilder {
  private config: TimelineConfig;

  constructor(config?: Partial<TimelineConfig>) {
    this.config = {
      addDoneStep: true,
      sortChronologically: true,
      toolMapper: defaultToolMapper,
      minimumActivities: 1,
      ...config
    };
  }

  /**
   * Builds timeline steps from tool activities for a specific run
   * @param activities Array of tool activities
   * @param runId The specific run ID to filter by
   * @returns Array of timeline steps ready for rendering
   */
  public buildTimelineForRun(activities: ToolActivity[], runId: string): TimelineStep[] {
    if (!activities || !runId) {
      return [];
    }

    // Filter activities for this specific run (handle optional runId)
    const relevantActivities = activities.filter(activity => activity.runId === runId);
    
    if (relevantActivities.length < this.config.minimumActivities) {
      return [];
    }

    // Filter out tools that shouldn't appear in timeline
    const filteredActivities = relevantActivities.filter(activity => 
      !this.config.toolMapper!.shouldFilterTool(activity.toolName)
    );

    if (filteredActivities.length === 0) {
      return [];
    }

    // Sort chronologically if enabled
    const sortedActivities = this.config.sortChronologically 
      ? this.sortActivitiesChronologically(filteredActivities)
      : filteredActivities;

    // Convert activities to timeline steps
    const steps = this.convertActivitiesToSteps(sortedActivities);

    // Add "Done" step if configured and all activities are complete
    // IMPORTANT: Evaluate completion against all relevant activities (pre-filter)
    // so that meta activities (like run-complete markers) can drive completion
    if (this.config.addDoneStep && this.haveAllActivitiesCompleted(relevantActivities)) {
      // When Done is added, ensure no other steps are pulsing
      steps.forEach(step => { step.isRunning = false; });
      steps.push(this.createDoneStep());
    }

    // Mark the last step
    if (steps.length > 0) {
      steps[steps.length - 1].isLast = true;
    }

    return steps;
  }

  /**
   * Builds timeline steps from all activities (useful for debugging/overview)
   * @param activities Array of tool activities
   * @returns Array of timeline steps
   */
  public buildTimelineFromAllActivities(activities: ToolActivity[]): TimelineStep[] {
    if (!activities || activities.length === 0) {
      return [];
    }

    // Group by runId and build timeline for each run
    const runGroups = this.groupActivitiesByRun(activities);
    const allSteps: TimelineStep[] = [];

    runGroups.forEach((runActivities, runId) => {
      const runSteps = this.buildTimelineForRun(runActivities, runId);
      allSteps.push(...runSteps);
    });

    return allSteps;
  }

  /**
   * Gets timeline statistics for analysis
   * @param activities Array of tool activities
   * @param runId Optional run ID to filter by
   * @returns Statistics about the timeline
   */
  public getTimelineStats(activities: ToolActivity[], runId?: string): {
    totalActivities: number;
    completedActivities: number;
    runningActivities: number;
    uniqueTools: number;
    timespan?: number; // milliseconds from first to last activity
  } {
    const relevantActivities = runId 
      ? activities.filter(activity => activity.runId === runId)
      : activities;

    const completed = relevantActivities.filter(a => a.status === 'complete');
    const running = relevantActivities.filter(a => a.status === 'running');
    const uniqueTools = new Set(relevantActivities.map(a => a.toolName)).size;

    const timestamps = relevantActivities
      .map(a => a.startedAt)
      .filter(Boolean) as number[];
    
    const timespan = timestamps.length > 1 
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : undefined;

    return {
      totalActivities: relevantActivities.length,
      completedActivities: completed.length,
      runningActivities: running.length,
      uniqueTools,
      timespan
    };
  }

  private sortActivitiesChronologically(activities: ToolActivity[]): ToolActivity[] {
    return [...activities].sort((a, b) => {
      const aTime = a.startedAt || 0;
      const bTime = b.startedAt || 0;
      return aTime - bTime;
    });
  }

  private convertActivitiesToSteps(activities: ToolActivity[]): TimelineStep[] {
    const stepMap = new Map<string, TimelineStep>();

    for (const activity of activities) {
      let label = this.config.toolMapper!.mapToolName(activity.toolName);
      if (!label) continue; // safety

      // Special handling: show "Putting it all together" only when transfer_back_to_clera is complete
      const isTransferBack = typeof activity.toolName === 'string' && activity.toolName.toLowerCase() === 'transfer_back_to_clera';
      if (isTransferBack && activity.status !== 'complete') {
        // Skip rendering an in-progress transfer_back_to_clera
        continue;
      }

      const existing = stepMap.get(label);
      const isComplete = activity.status === 'complete';
      const isRunning = activity.status === 'running';

      if (!existing) {
        stepMap.set(label, {
          id: activity.id,
          label,
          isComplete,
          isRunning,
          isLast: false,
          timestamp: activity.startedAt
        });
      } else {
        // Update completion/running flags – complete trumps running
        if (isComplete) existing.isComplete = true;
        // If currently running and step not marked complete yet, mark running
        if (isRunning && !existing.isComplete) existing.isRunning = true;
      }
    }

    // Order by the last occurrence of each label to ensure steps that repeat (e.g., "Putting it all together")
    // end up positioned where they finish, not where they first appeared.
    const lastIndexMap: Record<string, number> = {};
    activities.forEach((act, idx) => {
      const lbl = this.config.toolMapper!.mapToolName(act.toolName);
      if (lbl) lastIndexMap[lbl] = idx;
    });

    const ordered = Object.entries(lastIndexMap)
      .sort(([, aIdx], [, bIdx]) => aIdx - bIdx)
      .map(([label]) => stepMap.get(label))
      .filter((step): step is TimelineStep => Boolean(step));

    return ordered;
  }

  private haveAllActivitiesCompleted(activities: ToolActivity[]): boolean {
    if (!activities || activities.length === 0) return false;
    
    // Primary completion signal: explicit run completion marker added by the stream client
    const hasRunCompletionMarker = activities.some(activity => 
      typeof activity.toolName === 'string' && activity.toolName === '__run_completed__'
    );
    if (hasRunCompletionMarker) return true;
    
    // Conservative fallback: only when every activity is complete
    // This prevents premature Done when agents transfer back to Clera mid-run
    return activities.every(activity => activity.status === 'complete');
  }

  private createDoneStep(): TimelineStep {
    return {
      id: `done-${Date.now()}`,
      label: 'Done',
      isComplete: true,
      isRunning: false,
      isLast: true,
      timestamp: Date.now()
    };
  }

  private groupActivitiesByRun(activities: ToolActivity[]): Map<string, ToolActivity[]> {
    const groups = new Map<string, ToolActivity[]>();
    
    for (const activity of activities) {
      const runId = activity.runId || 'default';
      const runActivities = groups.get(runId) || [];
      runActivities.push(activity);
      groups.set(runId, runActivities);
    }
    
    return groups;
  }

  /**
   * Updates configuration at runtime
   * @param newConfig Partial configuration to merge
   */
  public updateConfig(newConfig: Partial<TimelineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets current configuration (for testing/debugging)
   */
  public getConfig(): TimelineConfig {
    return { ...this.config };
  }
}

// Factory to avoid shared mutable singletons
export function createTimelineBuilder(config?: Partial<TimelineConfig>): TimelineBuilder {
  return new TimelineBuilder(config);
}

// Export type for dependency injection
export type ITimelineBuilder = TimelineBuilder;
