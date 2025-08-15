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

    // Build an index of user messages and their positional index within the user-only list
    const userMessages = messages.filter(m => m.role === 'user');
    const userIndexByMessage = new Map<Message, number>();
    for (let i = 0; i < userMessages.length; i++) {
      userIndexByMessage.set(userMessages[i], i);
    }

    // Create immutable updates for messages that need runIds (both user and assistant)
    let changed = false;
    const updatedMessages = messages.map((message, idx) => {
      if (message.runId) return message;

      // Assign runId to user messages based on their index among user messages
      if (message.role === 'user') {
        const userIdx = userIndexByMessage.get(message);
        if (userIdx !== undefined && userIdx < persistedRunIds.length) {
          changed = true;
          return { ...message, runId: persistedRunIds[userIdx] };
        }
        return message;
      }

      // Assign runId to assistant messages based on the preceding user message's index
      if (message.role === 'assistant') {
        for (let j = idx - 1; j >= 0; j--) {
          const prev = messages[j];
          if (prev.role === 'user') {
            const prevUserIdx = userIndexByMessage.get(prev);
            if (prevUserIdx !== undefined && prevUserIdx < persistedRunIds.length) {
              changed = true;
              return { ...message, runId: persistedRunIds[prevUserIdx] };
            }
            break;
          }
        }
      }

      return message;
    });

    if (changed) {
      chatClient.setMessages(updatedMessages);
    }
  }, [messages, chatClient, persistedRunIds]);

  useEffect(() => {
    tryAssignRunIdsToMessages();
  }, [tryAssignRunIdsToMessages]);

  return {
    tryAssignRunIdsToMessages,
  };
}
