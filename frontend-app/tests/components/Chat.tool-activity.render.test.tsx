import React from 'react';
import { render, screen } from '@testing-library/react';
import Chat from '@/components/chat/Chat';

// Mock react-markdown to sidestep ESM issues in test environment
jest.mock('react-markdown', () => {
  return ({ children }: any) => <div>{children}</div>;
});

// Shim scrollIntoView for JSDOM
beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    // @ts-ignore
    HTMLElement.prototype.scrollIntoView = function scrollIntoView() {} as any;
  }
});

// Mock useSecureChat to control state
jest.mock('@/utils/api/secure-chat-client', () => {
  const actual = jest.requireActual('@/utils/api/secure-chat-client');
  return {
    ...actual,
    useSecureChat: jest.fn(),
  };
});

const { useSecureChat } = require('@/utils/api/secure-chat-client');

describe('Chat component tool activity rendering', () => {
  test('renders timeline when user message with runId and activities exist', () => {
    // Mock client with proper state including user message and matching activities
    const mockClient = {
      state: {
        messages: [
          { id: '1', role: 'user', content: 'Test message', runId: 'test-run-1' },
          { id: '2', role: 'assistant', content: 'Analyzing...', isStatus: true, runId: 'test-run-1' }
        ],
        isLoading: false,
        error: null,
        interrupt: null,
        modelProviderError: false,
        toolActivities: [
          { id: '1', toolName: 'web_search', status: 'running', startedAt: Date.now(), runId: 'test-run-1' },
          { id: '2', toolName: 'get_stock_price', status: 'complete', startedAt: Date.now(), completedAt: Date.now(), runId: 'test-run-1' }
        ]
      },
      subscribe: () => () => {},
      setLongProcessingCallback: () => {},
      clearLongProcessingCallback: () => {},
      setMessages: () => {},
      addMessagesWithStatus: () => {},
      startStream: async () => {},
      handleInterrupt: async () => {},
      clearError: () => {},
      clearErrorOnChatLoad: () => {},
      clearModelProviderError: () => {},
      cleanup: () => {}
    } as any;

    (useSecureChat as jest.MockedFunction<any>).mockReturnValue(mockClient);

    render(
      <Chat
        accountId="acc_1"
        userId="user_1"
        onClose={() => {}}
        isFullscreen={false}
        isLimitReached={false}
      />
    );

    // Look for "Show details" button
    expect(screen.getByText('Show details')).toBeInTheDocument();
  });
});


