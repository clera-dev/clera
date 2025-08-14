import { useEffect, useRef, useState } from 'react';
import { SecureChatClient } from '@/utils/api/secure-chat-client';

interface UseToolActivitiesHydrationParams {
  currentThreadId: string | undefined;
  accountId: string;
  chatClient: SecureChatClient;
  onRunIdsLoaded?: (runIds: string[]) => void;
}

/**
 * Custom hook that handles hydration of persisted tool activities for the current thread.
 * Separates the hydration concern from the main Chat component.
 */
export function useToolActivitiesHydration({
  currentThreadId,
  accountId,
  chatClient,
  onRunIdsLoaded,
}: UseToolActivitiesHydrationParams) {
  const persistedRunIdsRef = useRef<string[] | null>(null);
  const [persistedRunIds, setPersistedRunIds] = useState<string[] | null>(null);

  useEffect(() => {
    (async () => {
      if (!currentThreadId) return;
      try {
        const params = new URLSearchParams({ thread_id: currentThreadId, account_id: accountId });
        const res = await fetch(`/api/conversations/get-tool-activities?${params.toString()}`, {
          method: 'GET'
        });
        if (!res.ok) return;
        const data = await res.json();
        const runs = Array.isArray(data.runs) ? data.runs : [];
        
        // Convert persisted runs into tool activity items in chronological order
        const persistedActivities = runs.flatMap((run: any) =>
          (run.tool_calls || []).map((t: any) => {
            // If the run itself is complete, all its activities should be marked complete
            // This prevents pulsing when revisiting completed threads
            const runIsComplete = run.status === 'complete' || run.ended_at;
            const activityStatus = runIsComplete ? 'complete' : (t.status === 'complete' ? 'complete' : 'running');
            
            // Safely parse timestamps; fallback to current time to avoid NaN breaking comparisons
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
              status: activityStatus,
              startedAt: startedAtMs,
              completedAt: completedAtMs,
              // include runId to anchor rendering under the correct user message
              runId: run.run_id,
            };
          })
        );
        
        // Merge persisted activities with current ones (preserving new activities like "Thinking")
        const currentActivities = chatClient.state.toolActivities;
        // Deduplicate by unique activity id, not by runId, to avoid dropping other events from the same run
        const newPersistedActivities = persistedActivities.filter((persisted: any) =>
          !currentActivities.some((c: any) => c.id === persisted.id)
        );
        
        const mergedActivities = [...currentActivities, ...newPersistedActivities];
        chatClient.mergePersistedToolActivities(mergedActivities);

        // Store sorted runIds for assignment once messages are hydrated
        const sortedRuns = [...runs].sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
        const loadedRunIds: string[] = sortedRuns.map((r: any) => r.run_id);
        persistedRunIdsRef.current = loadedRunIds;
        setPersistedRunIds(loadedRunIds);

        // Notify parent component of loaded run IDs
        if (onRunIdsLoaded) {
          onRunIdsLoaded(loadedRunIds);
        }
      } catch (err) {
        console.error('Failed to hydrate tool activities', err);
      }
    })();
  }, [currentThreadId, accountId, chatClient, onRunIdsLoaded]);

  return {
    persistedRunIds,
  };
}
