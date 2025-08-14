import { useEffect, useCallback } from 'react';
import { Message } from '@/utils/api/chat-client';
import { SecureChatClient } from '@/utils/api/secure-chat-client';

interface UseRunIdAssignmentParams {
  messages: Message[];
  chatClient: SecureChatClient;
  persistedRunIds: string[] | null;
}

/**
 * Custom hook that handles assignment of runIds to messages based on persisted data.
 * Separates runId assignment logic from the main Chat component.
 */
export function useRunIdAssignment({
  messages,
  chatClient,
  persistedRunIds,
}: UseRunIdAssignmentParams) {
  const tryAssignRunIdsToMessages = useCallback(() => {
    if (!persistedRunIds || persistedRunIds.length === 0) return;

    const userMessages = messages.filter(m => m.role === 'user');
    let updated = false;

    userMessages.forEach((userMsg, index) => {
      if (!userMsg.runId && index < persistedRunIds.length) {
        userMsg.runId = persistedRunIds[index];
        updated = true;

        // Also assign runId to the subsequent assistant message if it exists
        const nextAssistantMsgIndex = messages.findIndex((m, i) => 
          i > messages.indexOf(userMsg) && m.role === 'assistant'
        );
        if (nextAssistantMsgIndex !== -1 && !messages[nextAssistantMsgIndex].runId) {
          messages[nextAssistantMsgIndex].runId = persistedRunIds[index];
        }
      }
    });

    if (updated) {
      // Trigger a re-render by setting the updated messages
      chatClient.setMessages([...messages]);
    }
  }, [messages, chatClient, persistedRunIds]);

  useEffect(() => {
    tryAssignRunIdsToMessages();
  }, [tryAssignRunIdsToMessages]);

  return {
    tryAssignRunIdsToMessages,
  };
}
