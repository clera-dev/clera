import { useEffect, useRef, useState } from 'react';
import { SecureChatClient } from '@/utils/api/secure-chat-client';

interface UseToolActivitiesHydrationParams {
  currentThreadId: string | undefined;
  accountId: string | undefined;
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
        const runIds = await chatClient.fetchAndHydrateToolActivities(currentThreadId, accountId);
        if (!runIds || runIds.length === 0) {
          setPersistedRunIds([]);
          persistedRunIdsRef.current = [];
          if (onRunIdsLoaded) onRunIdsLoaded([]);
          return;
        }
        
        // Store sorted runIds
        persistedRunIdsRef.current = runIds;
        setPersistedRunIds(runIds);

        // Notify parent component of loaded run IDs
        if (onRunIdsLoaded) {
          onRunIdsLoaded(runIds);
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
