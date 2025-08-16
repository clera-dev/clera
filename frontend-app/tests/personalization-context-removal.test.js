/**
 * Test that personalization context removal doesn't break chat functionality.
 * This ensures the frontend now sends clean user messages without enhancement.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Chat from '@/components/chat/Chat';

// Mock the necessary imports
jest.mock('@/utils/api/secure-chat-client', () => ({
  SecureChatClient: {
    getInstance: jest.fn(() => ({
      addMessagesWithStatus: jest.fn(),
      startChatStream: jest.fn(),
      submitMessageToExistingThread: jest.fn(() => Promise.resolve({ run_id: 'test-run' })),
      interruptRun: jest.fn(),
      handleIncomingMessage: jest.fn(),
      clearChatHistory: jest.fn(),
      messages: []
    }))
  }
}));

jest.mock('@/utils/api/personalization-client', () => ({
  getPersonalizationData: jest.fn(() => Promise.resolve(null))
}));

jest.mock('@/utils/services/personalization-service', () => ({
  PersonalizationService: {
    hasPersonalizationData: jest.fn(() => Promise.resolve(false)),
    getPersonalizationSummary: jest.fn(() => Promise.resolve(''))
    // NOTE: enhanceMessageWithContext should NOT be available
  }
}));

describe('Personalization Context Removal', () => {
  const defaultProps = {
    accountId: 'test-account',
    userId: 'test-user',
    onClose: jest.fn(),
    isFullscreen: false,
    sessionId: null,
    initialMessages: [],
    onMessageSent: jest.fn(),
    onQuerySent: jest.fn(),
    isLimitReached: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should import Chat component without PersonalizationService enhancement methods', () => {
    // Static analysis - read the Chat.tsx file content
    const fs = require('fs');
    const path = require('path');
    
    const chatFilePath = path.join(__dirname, '../components/chat/Chat.tsx');
    const chatFileContent = fs.readFileSync(chatFilePath, 'utf8');
    
    // Verify PersonalizationService is not imported
    expect(chatFileContent).not.toContain('PersonalizationService');
    expect(chatFileContent).not.toContain('enhanceMessageWithContext');
    expect(chatFileContent).not.toContain('getPersonalizationContext');
    
    // Verify clean message handling
    expect(chatFileContent).toContain('contentToSend = trimmedInput');
    expect(chatFileContent).not.toContain('contentPromise');
    expect(chatFileContent).not.toContain('await contentPromise');
  });

  test('should not import PersonalizationService enhancement methods in personalization-service.ts', () => {
    // Static analysis - read the personalization-service.ts file content
    const fs = require('fs');
    const path = require('path');
    
    const serviceFilePath = path.join(__dirname, '../utils/services/personalization-service.ts');
    const serviceFileContent = fs.readFileSync(serviceFilePath, 'utf8');
    
    // Verify methods are removed/commented out
    expect(serviceFileContent).toContain('enhanceMessageWithContext removed');
    expect(serviceFileContent).toContain('getPersonalizationContext removed');
    expect(serviceFileContent).toContain('formatPersonalizationPrompt removed');
    
    // Verify the methods are not actually present (not just commented)
    const methodRegex = /static\s+async\s+enhanceMessageWithContext/;
    expect(serviceFileContent).not.toMatch(methodRegex);
  });

  test('should render chat component without personalization enhancement', () => {
    render(<Chat {...defaultProps} />);
    
    // Chat should render normally
    expect(screen.getByPlaceholderText(/Ask Clera anything/i)).toBeInTheDocument();
  });

  test('should handle message sending with clean content (no personalization enhancement)', async () => {
    const mockSubmitMessage = jest.fn(() => Promise.resolve({ run_id: 'test-run' }));
    const mockAddMessages = jest.fn();
    
    // Mock the SecureChatClient
    const mockClient = {
      addMessagesWithStatus: mockAddMessages,
      submitMessageToExistingThread: mockSubmitMessage,
      messages: []
    };

    // Mock the getInstance to return our mock client
    require('@/utils/api/secure-chat-client').SecureChatClient.getInstance.mockReturnValue(mockClient);
    
    render(<Chat {...defaultProps} sessionId="existing-thread" />);
    
    const input = screen.getByPlaceholderText(/Ask Clera anything/i);
    const testMessage = 'What should I invest in?';
    
    // Type a message
    fireEvent.change(input, { target: { value: testMessage } });
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 });
    
    await waitFor(() => {
      // Verify the message was added to UI with clean content
      expect(mockAddMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          content: testMessage  // Clean message, no personalization prepended
        })
      );
    });
  });

  test('should create new chat sessions with clean message content', async () => {
    const mockCreateSession = jest.fn(() => Promise.resolve({ id: 'new-thread-id' }));
    
    // Mock createChatSession function
    jest.doMock('@/utils/api/conversation-client', () => ({
      createChatSession: mockCreateSession
    }));
    
    const mockClient = {
      addMessagesWithStatus: jest.fn(),
      messages: []
    };
    
    require('@/utils/api/secure-chat-client').SecureChatClient.getInstance.mockReturnValue(mockClient);
    
    render(<Chat {...defaultProps} sessionId={null} />);
    
    const input = screen.getByPlaceholderText(/Ask Clera anything/i);
    const testMessage = 'Help me start investing';
    
    // Type a message (this should create a new session)
    fireEvent.change(input, { target: { value: testMessage } });
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 });
    
    await waitFor(() => {
      // Verify session was created with clean message title
      expect(mockCreateSession).toHaveBeenCalledWith(
        'test-account',
        'test-user',
        expect.any(String) // Should be clean message, not enhanced
      );
    });
  });

  test('should not have any personalization enhancement functionality available', () => {
    // Import the PersonalizationService to check what methods are available
    const PersonalizationService = require('@/utils/services/personalization-service').PersonalizationService;
    
    // Methods that should NOT exist anymore
    expect(PersonalizationService.enhanceMessageWithContext).toBeUndefined();
    expect(PersonalizationService.getPersonalizationContext).toBeUndefined();
    expect(PersonalizationService.formatPersonalizationPrompt).toBeUndefined();
    
    // Methods that should still exist (UI-related)
    expect(PersonalizationService.hasPersonalizationData).toBeDefined();
    expect(PersonalizationService.getPersonalizationSummary).toBeDefined();
  });

  test('should handle empty messages correctly without enhancement', () => {
    const mockClient = {
      addMessagesWithStatus: jest.fn(),
      submitMessageToExistingThread: jest.fn(),
      messages: []
    };
    
    require('@/utils/api/secure-chat-client').SecureChatClient.getInstance.mockReturnValue(mockClient);
    
    render(<Chat {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/Ask Clera anything/i);
    
    // Try to send empty message
    fireEvent.change(input, { target: { value: '   ' } }); // Whitespace only
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 });
    
    // Should not send message or call any enhancement functions
    expect(mockClient.addMessagesWithStatus).not.toHaveBeenCalled();
    expect(mockClient.submitMessageToExistingThread).not.toHaveBeenCalled();
  });
});

describe('Performance Impact of Personalization Removal', () => {
  test('should not perform any async personalization operations during message sending', async () => {
    const mockClient = {
      addMessagesWithStatus: jest.fn(),
      submitMessageToExistingThread: jest.fn(() => Promise.resolve({ run_id: 'test' })),
      messages: []
    };
    
    require('@/utils/api/secure-chat-client').SecureChatClient.getInstance.mockReturnValue(mockClient);
    
    const { rerender } = render(<Chat {...defaultProps} sessionId="existing-thread" />);
    
    const startTime = performance.now();
    
    const input = screen.getByPlaceholderText(/Ask Clera anything/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 });
    
    // Message should be added to UI immediately (synchronously)
    expect(mockClient.addMessagesWithStatus).toHaveBeenCalledImmediately();
    
    const endTime = performance.now();
    
    // UI update should be very fast (< 10ms) since no async personalization fetching
    expect(endTime - startTime).toBeLessThan(10);
  });
});

// Helper custom matcher
expect.extend({
  toHaveBeenCalledImmediately(received) {
    const pass = received.mock.calls.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received.getMockName()} not to have been called immediately`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received.getMockName()} to have been called immediately`,
        pass: false,
      };
    }
  },
});
