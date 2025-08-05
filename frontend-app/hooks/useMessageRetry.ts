import { useState, useCallback, useEffect } from 'react';
import { SecureChatClient } from '@/utils/api/secure-chat-client';

interface RetryState {
  lastFailedMessage: string | null;
  lastFailedThreadId: string | null;
}

interface UseMessageRetryReturn {
  // State
  retryState: RetryState;
  shouldShowRetryPopup: boolean;
  
  // Actions
  prepareForSend: (message: string, threadId: string) => void;
  handleSendSuccess: () => void;
  handleSendError: () => void;
  handleRetry: () => Promise<void>;
  handleDismissRetry: () => void;
}

interface UseMessageRetryOptions {
  chatClient: SecureChatClient; // NEW: Accept existing chatClient instead of creating new one
  userId: string;
  accountId: string;
  onMessageSent?: () => void;
  onQuerySent?: () => Promise<void>;
  onFirstMessageFlagReset?: () => void;
}

/**
 * Custom hook for managing message retry state and orchestration.
 * Encapsulates retry logic to prevent duplication across send paths.
 * 
 * ARCHITECTURAL FIX: Now accepts existing chatClient to maintain single source of truth
 * REACTIVITY FIX: Subscribes to chatClient state changes for reactive updates
 */
export function useMessageRetry(options: UseMessageRetryOptions): UseMessageRetryReturn {
  const { chatClient, userId, accountId, onMessageSent, onQuerySent, onFirstMessageFlagReset } = options;
  
  // Retry state management
  const [retryState, setRetryState] = useState<RetryState>({
    lastFailedMessage: null,
    lastFailedThreadId: null,
  });

  // REACTIVITY FIX: Subscribe to chatClient state changes to make hook reactive
  const [modelProviderError, setModelProviderError] = useState(chatClient.state.modelProviderError);

  // Subscribe to chatClient state changes
  useEffect(() => {
    const unsubscribe = chatClient.subscribe(() => {
      // Update local state when chatClient state changes
      setModelProviderError(chatClient.state.modelProviderError);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, [chatClient]);

  // Derived state - now reactive to chatClient state changes
  const hasModelProviderError = modelProviderError;
  const shouldShowRetryPopup = hasModelProviderError && 
                              retryState.lastFailedMessage !== null && 
                              retryState.lastFailedThreadId !== null;

  /**
   * Prepare retry state before attempting to send a message
   */
  const prepareForSend = useCallback((message: string, threadId: string) => {
    setRetryState({
      lastFailedMessage: message,
      lastFailedThreadId: threadId,
    });
  }, []);

  /**
   * Clear retry state on successful message send
   */
  const handleSendSuccess = useCallback(() => {
    setRetryState({
      lastFailedMessage: null,
      lastFailedThreadId: null,
    });
  }, []);

  /**
   * Keep retry state on send error for potential retry
   */
  const handleSendError = useCallback(() => {
    // Keep retry state intact for potential retry
    // No action needed - state is already set by prepareForSend
  }, []);

  /**
   * Execute intelligent retry using LangGraph's interrupt mechanism
   */
  const handleRetry = useCallback(async () => {
    if (!retryState.lastFailedMessage || !retryState.lastFailedThreadId) return;

    // Clear the model provider error state first
    chatClient.clearModelProviderError();

    // Use LangGraph's interrupt mechanism to retry the same message
    const runInput = {
      messages: [{ type: 'human' as const, content: retryState.lastFailedMessage }],
    };

    try {
      console.log('[useMessageRetry] Retrying failed message using LangGraph interrupt mechanism.');
      
      // Use the same thread but with interrupt strategy to replace the failed attempt
      await chatClient.startStream(retryState.lastFailedThreadId, runInput, userId, accountId);

      // Clear retry state on successful retry
      handleSendSuccess();

      // Callbacks after successful retry
      onMessageSent?.();
      await onQuerySent?.();

    } catch (err) {
      console.error("Error during intelligent retry:", err);
      // Keep retry state for another attempt (handleSendError is called implicitly)
    }
  }, [
    retryState.lastFailedMessage, 
    retryState.lastFailedThreadId, 
    chatClient, 
    userId, 
    accountId, 
    onMessageSent, 
    onQuerySent,
    handleSendSuccess
  ]);

  /**
   * Dismiss retry popup and clear retry state
   */
  const handleDismissRetry = useCallback(() => {
    setRetryState({
      lastFailedMessage: null,
      lastFailedThreadId: null,
    });
    chatClient.clearModelProviderError();
    
    // Reset first message flag to allow retry for first messages
    onFirstMessageFlagReset?.();
  }, [chatClient, onFirstMessageFlagReset]);

  return {
    // State
    retryState,
    shouldShowRetryPopup,
    
    // Actions
    prepareForSend,
    handleSendSuccess,
    handleSendError,
    handleRetry,
    handleDismissRetry,
  };
} 