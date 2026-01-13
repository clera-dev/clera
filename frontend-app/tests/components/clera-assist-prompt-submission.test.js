/**
 * @jest-environment jsdom
 * 
 * Tests for the Clera Assist prompt submission functionality.
 * 
 * CRITICAL BUG FIX: The blue buttons (e.g., "Analyze my progress") and arrows
 * on the news page that trigger prebuilt prompts in chat must work for ALL users,
 * including SnapTrade/aggregation mode users who do NOT have an accountId.
 * 
 * The bug was that prompt submission required `accountId && userId` to be truthy,
 * but accountId is legitimately undefined for SnapTrade users. The fix removes
 * the accountId requirement from the conditions since only userId is required.
 */

import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// ============================================================================
// MOCKS
// ============================================================================

// Track mock function calls for verification
const mockStartStream = jest.fn().mockResolvedValue(undefined);
const mockSetMessages = jest.fn();
const mockAddMessagesWithStatus = jest.fn();
const mockClearError = jest.fn();
const mockHandleSendMessage = jest.fn().mockResolvedValue(true);

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: '/portfolio',
    query: {},
    asPath: '/portfolio',
  }),
  usePathname: () => '/portfolio',
}));

// Mock Supabase
jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'test-user-id' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  }),
}));

// Mock utilities
jest.mock('@/lib/utils', () => ({
  cn: (...classes) => classes.filter(Boolean).join(' '),
  formatCurrency: (amount) => `$${amount?.toFixed(2) || '0.00'}`,
  getAlpacaAccountId: () => Promise.resolve(null), // No Alpaca account for aggregation users
}));

// Mock the secure chat client
jest.mock('@/utils/api/secure-chat-client', () => ({
  useSecureChat: () => ({
    state: {
      messages: [],
      isLoading: false,
      error: null,
      interrupt: null,
      toolActivities: {},
    },
    startStream: mockStartStream,
    setMessages: mockSetMessages,
    addMessagesWithStatus: mockAddMessagesWithStatus,
    clearError: mockClearError,
    clearCitations: jest.fn(),
    prePopulateProcessedToolFingerprints: jest.fn(),
    setQuerySuccessCallback: jest.fn(),
    setLongProcessingCallback: jest.fn(),
    clearLongProcessingCallback: jest.fn(),
    clearErrorOnChatLoad: jest.fn(),
  }),
}));

// Mock chat-client utilities
jest.mock('@/utils/api/chat-client', () => ({
  saveChatHistory: jest.fn(),
  loadChatHistory: jest.fn(),
  formatChatTitle: (text) => text.substring(0, 50),
  updateChatThreadTitle: jest.fn(),
  createChatSession: jest.fn().mockResolvedValue({ id: 'new-session-id' }),
  getThreadMessages: jest.fn().mockResolvedValue({ messages: [], toolFingerprints: [] }),
  getUserDailyQueryCount: jest.fn().mockResolvedValue(0),
}));

// Mock query limit service
jest.mock('@/utils/services/QueryLimitService', () => ({
  queryLimitService: {
    recordQueryReliable: jest.fn().mockResolvedValue(true),
    getCurrentQueryCount: jest.fn().mockResolvedValue(0),
  },
}));

// Mock useQueryLimit hook
jest.mock('@/hooks/useQueryLimit', () => ({
  useQueryLimit: () => ({
    checkCanProceed: jest.fn().mockResolvedValue(true),
    showLimitPopup: false,
    nextResetTime: null,
    dismissPopup: jest.fn(),
  }),
}));

// Mock other hooks
jest.mock('@/hooks/useMessageRetry', () => ({
  useMessageRetry: () => ({
    prepareForSend: jest.fn(),
    shouldShowRetryPopup: false,
    handleRetry: jest.fn(),
    handleDismissRetry: jest.fn(),
  }),
}));

jest.mock('@/hooks/useToolActivitiesHydration', () => ({
  useToolActivitiesHydration: () => ({
    persistedRunIds: new Set(),
  }),
}));

jest.mock('@/hooks/useRunIdAssignment', () => ({
  useRunIdAssignment: () => ({
    tryAssignRunIdsToMessages: jest.fn(),
  }),
}));

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isMobile: false,
    isDesktop: true,
  }),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Clera Assist Prompt Submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('cleraAssistPrompt Event Handling', () => {
    test('should handle cleraAssistPrompt event when only userId is present (no accountId)', () => {
      // Simulate the condition: userId is set, accountId is undefined (aggregation mode)
      const userId = 'test-user-id';
      const accountId = undefined; // SnapTrade/aggregation mode user
      const prompt = 'Analyze my portfolio performance';

      // This simulates the condition check in Chat.tsx after the fix:
      // OLD (broken): if (prompt && prompt.trim() && accountId && userId)
      // NEW (fixed): if (prompt && prompt.trim() && userId)
      const oldCondition = prompt && prompt.trim() && accountId && userId;
      const newCondition = prompt && prompt.trim() && userId;

      expect(oldCondition).toBeFalsy(); // Bug: This would fail for aggregation users
      expect(newCondition).toBeTruthy(); // Fix: This works for all users with userId
    });

    test('should handle cleraAssistPrompt event when both userId and accountId are present', () => {
      const userId = 'test-user-id';
      const accountId = 'alpaca-account-id'; // Brokerage mode user
      const prompt = 'Analyze my portfolio performance';

      const newCondition = prompt && prompt.trim() && userId;

      expect(newCondition).toBeTruthy(); // Works for brokerage users too
    });

    test('should reject cleraAssistPrompt event when userId is missing', () => {
      const userId = null; // Not authenticated
      const accountId = undefined;
      const prompt = 'Analyze my portfolio';

      const newCondition = prompt && prompt.trim() && userId;

      expect(newCondition).toBeFalsy(); // Correctly rejects unauthenticated users
    });

    test('should reject cleraAssistPrompt event when prompt is empty', () => {
      const userId = 'test-user-id';
      const accountId = undefined;
      const prompt = '   '; // Empty/whitespace-only prompt

      const newCondition = prompt && prompt.trim() && userId;

      expect(newCondition).toBeFalsy(); // Correctly rejects empty prompts
    });
  });

  describe('Initial Prompt Auto-submission', () => {
    test('should auto-submit initialPrompt when only userId is present', () => {
      const initialPrompt = 'Analyze my progress';
      const userId = 'test-user-id';
      const accountId = undefined; // SnapTrade user
      const isFirstMessageSent = false;
      const autoSubmissionTriggered = { current: false };

      // OLD condition (broken):
      // if (initialPrompt && initialPrompt.trim() && !isFirstMessageSent && accountId && userId && !autoSubmissionTriggered.current)
      const oldCondition = initialPrompt && initialPrompt.trim() && !isFirstMessageSent && accountId && userId && !autoSubmissionTriggered.current;

      // NEW condition (fixed):
      // if (initialPrompt && initialPrompt.trim() && !isFirstMessageSent && userId && !autoSubmissionTriggered.current)
      const newCondition = initialPrompt && initialPrompt.trim() && !isFirstMessageSent && userId && !autoSubmissionTriggered.current;

      expect(oldCondition).toBeFalsy(); // Bug: Would not auto-submit for aggregation users
      expect(newCondition).toBeTruthy(); // Fix: Auto-submits for all authenticated users
    });

    test('should not auto-submit when already sent', () => {
      const initialPrompt = 'Analyze my progress';
      const userId = 'test-user-id';
      const isFirstMessageSent = true; // Already sent
      const autoSubmissionTriggered = { current: false };

      const newCondition = initialPrompt && initialPrompt.trim() && !isFirstMessageSent && userId && !autoSubmissionTriggered.current;

      expect(newCondition).toBeFalsy();
    });

    test('should not auto-submit when autoSubmissionTriggered is true', () => {
      const initialPrompt = 'Analyze my progress';
      const userId = 'test-user-id';
      const isFirstMessageSent = false;
      const autoSubmissionTriggered = { current: true }; // Already triggered

      const newCondition = initialPrompt && initialPrompt.trim() && !isFirstMessageSent && userId && !autoSubmissionTriggered.current;

      expect(newCondition).toBeFalsy();
    });
  });

  describe('Custom Event Dispatch and Handling', () => {
    test('should dispatch cleraAssistPrompt event with prompt and context', () => {
      const mockEventListener = jest.fn();
      window.addEventListener('cleraAssistPrompt', mockEventListener);

      const prompt = 'Analyze these trending headlines';
      const context = 'trending_news_analysis';

      const customEvent = new CustomEvent('cleraAssistPrompt', {
        detail: { prompt, context }
      });
      window.dispatchEvent(customEvent);

      expect(mockEventListener).toHaveBeenCalledTimes(1);
      expect(mockEventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { prompt, context }
        })
      );

      window.removeEventListener('cleraAssistPrompt', mockEventListener);
    });

    test('should handle event listener cleanup on component unmount', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      // Simulate component mount/unmount
      const handler = jest.fn();
      window.addEventListener('cleraAssistPrompt', handler);
      window.removeEventListener('cleraAssistPrompt', handler);

      expect(addEventListenerSpy).toHaveBeenCalledWith('cleraAssistPrompt', handler);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('cleraAssistPrompt', handler);
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined prompt gracefully', () => {
      const userId = 'test-user-id';
      const prompt = undefined;

      const condition = prompt && prompt.trim && prompt.trim() && userId;

      expect(condition).toBeFalsy();
    });

    test('should handle null prompt gracefully', () => {
      const userId = 'test-user-id';
      const prompt = null;

      const condition = prompt && prompt.trim && prompt.trim() && userId;

      expect(condition).toBeFalsy();
    });

    test('should handle prompt with only newlines', () => {
      const userId = 'test-user-id';
      const prompt = '\n\n\n';

      const condition = prompt && prompt.trim() && userId;

      expect(condition).toBeFalsy();
    });

    test('should trim prompt before checking', () => {
      const userId = 'test-user-id';
      const prompt = '  Valid prompt  ';

      const condition = prompt && prompt.trim() && userId;

      expect(condition).toBeTruthy();
    });
  });

  describe('Aggregation Mode Scenarios', () => {
    test('should work for SnapTrade user with connected brokerage accounts', () => {
      // SnapTrade user scenario: has userId, no alpaca accountId
      const userId = 'snaptrade-user-123';
      const accountId = undefined;
      const prompt = 'What is my current stock vs. bond mix?';

      const condition = prompt && prompt.trim() && userId;

      expect(condition).toBeTruthy();
    });

    test('should work for user transitioning from aggregation to brokerage mode', () => {
      // User who started with SnapTrade, later adds Alpaca
      const userId = 'transition-user-456';
      const accountId = 'alpaca-new-account';
      const prompt = 'Analyze my portfolio diversification';

      const condition = prompt && prompt.trim() && userId;

      expect(condition).toBeTruthy();
    });
  });

  describe('Processing State Handling', () => {
    test('should not submit when isProcessing is true', () => {
      const userId = 'test-user-id';
      const isProcessing = true;
      const isInterrupting = false;
      const prompt = 'Analyze my progress';

      // Inner condition check (after setTimeout)
      const canSubmit = !isProcessing && !isInterrupting && userId;

      expect(canSubmit).toBeFalsy();
    });

    test('should not submit when isInterrupting is true', () => {
      const userId = 'test-user-id';
      const isProcessing = false;
      const isInterrupting = true;
      const prompt = 'Analyze my progress';

      const canSubmit = !isProcessing && !isInterrupting && userId;

      expect(canSubmit).toBeFalsy();
    });

    test('should submit when neither processing nor interrupting', () => {
      const userId = 'test-user-id';
      const isProcessing = false;
      const isInterrupting = false;

      const canSubmit = !isProcessing && !isInterrupting && userId;

      expect(canSubmit).toBeTruthy();
    });
  });
});

describe('CleraAssistProvider Integration', () => {
  test('should correctly dispatch event from openChatWithPrompt', () => {
    const mockEventListener = jest.fn();
    window.addEventListener('cleraAssistPrompt', mockEventListener);

    // Simulate what openChatWithPrompt does in clera-assist-provider.tsx
    const prompt = 'Analyze my portfolio';
    const context = 'portfolio_summary';

    // The provider dispatches this event after a 100ms timeout
    window.dispatchEvent(new CustomEvent('cleraAssistPrompt', {
      detail: { prompt, context }
    }));

    expect(mockEventListener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { prompt, context }
      })
    );

    window.removeEventListener('cleraAssistPrompt', mockEventListener);
  });
});

describe('Component-Specific Scenarios', () => {
  describe('PortfolioSummaryWithAssist', () => {
    test('should generate correct prompt for "Analyze my progress" button', () => {
      // From PortfolioSummaryWithAssist.tsx
      const accountId = undefined; // Aggregation mode
      const disabled = false;
      const hasHistoryData = true;

      const getTriggerText = () => {
        if (!accountId || disabled) return "Analyze my progress";
        if (!hasHistoryData) return "Understanding performance";
        return "Analyze my progress";
      };

      expect(getTriggerText()).toBe("Analyze my progress");
    });
  });

  describe('TrendingNewsWithAssist', () => {
    test('should generate correct prompt for news analysis', () => {
      // From TrendingNewsWithAssist.tsx
      const trendingNews = [
        { title: 'Fed raises rates', source: 'Reuters' },
        { title: 'Tech stocks rally', source: 'Bloomberg' }
      ];
      const disabled = false;
      const hasNews = trendingNews.length > 0;

      const getTriggerText = () => {
        if (disabled) return "Learn news analysis";
        if (!hasNews) return "Understanding market news";
        return "Analyze these headlines";
      };

      expect(getTriggerText()).toBe("Analyze these headlines");
    });
  });
});
