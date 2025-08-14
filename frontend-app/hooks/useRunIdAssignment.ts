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
    let needsUpdate = false;

    // Check if any user messages need runId assignment
    userMessages.forEach((userMsg, index) => {
      if (!userMsg.runId && index < persistedRunIds.length) {
        needsUpdate = true;
      }
    });

    if (!needsUpdate) return;

    // Create immutable updates for messages that need runIds
    const updatedMessages = messages.map((message) => {
      const userMsgIndex = userMessages.findIndex(um => um === message);
      
      // If this is a user message that needs a runId
      if (userMsgIndex !== -1 && !message.runId && userMsgIndex < persistedRunIds.length) {
        return { ...message, runId: persistedRunIds[userMsgIndex] };
      }
      
      // If this is an assistant message that follows a user message needing runId assignment
      if (message.role === 'assistant' && !message.runId) {
        // Find the preceding user message
        const messageIndex = messages.indexOf(message);
        const precedingUserMsg = messages.slice(0, messageIndex).reverse().find(m => m.role === 'user');
        
        if (precedingUserMsg) {
          const precedingUserIndex = userMessages.findIndex(um => um === precedingUserMsg);
          if (precedingUserIndex !== -1 && precedingUserIndex < persistedRunIds.length) {
            return { ...message, runId: persistedRunIds[precedingUserIndex] };
          }
        }
      }
      
      return message; // No change needed
    });

    // Only update if something actually changed
    chatClient.setMessages(updatedMessages);
  }, [messages, chatClient, persistedRunIds]);

  useEffect(() => {
    tryAssignRunIdsToMessages();
  }, [tryAssignRunIdsToMessages]);

  return {
    tryAssignRunIdsToMessages,
  };
}
