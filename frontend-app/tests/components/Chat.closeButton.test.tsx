import { render, screen, fireEvent } from '@testing-library/react';
import Chat from '@/components/chat/Chat';

// Mock the secure chat hook
jest.mock('@/utils/api/secure-chat-client', () => ({
  useSecureChat: () => ({
    state: {
      messages: [],
      isLoading: false,
      error: null,
      interrupt: null,
    },
    setMessages: jest.fn(),
    startStream: jest.fn(),
    clearError: jest.fn(),
    clearErrorOnChatLoad: jest.fn(),
    handleInterrupt: jest.fn(),
    setLongProcessingCallback: jest.fn(),
  }),
}));

// Mock the message retry hook
jest.mock('@/hooks/useMessageRetry', () => ({
  useMessageRetry: () => ({
    shouldShowRetryPopup: false,
    prepareForSend: jest.fn(),
    handleRetry: jest.fn(),
    handleDismissRetry: jest.fn(),
  }),
}));

// Mock the chat client functions
jest.mock('@/utils/api/chat-client', () => ({
  saveChatHistory: jest.fn(),
  loadChatHistory: jest.fn(),
  formatChatTitle: jest.fn(),
  updateChatThreadTitle: jest.fn(),
  createChatSession: jest.fn(),
  getThreadMessages: jest.fn(() => Promise.resolve([])),
}));

// Mock the avatar components
jest.mock('@/components/chat/UserAvatar', () => {
  return function MockUserAvatar() {
    return <div data-testid="user-avatar">User Avatar</div>;
  };
});

jest.mock('@/components/chat/CleraAvatar', () => {
  return function MockCleraAvatar() {
    return <div data-testid="clera-avatar">Clera Avatar</div>;
  };
});

// Mock SuggestedQuestions
jest.mock('@/components/chat/SuggestedQuestions', () => {
  return function MockSuggestedQuestions({ onSelect }: { onSelect: (question: string) => void }) {
    return (
      <div data-testid="suggested-questions">
        <button onClick={() => onSelect('Test question')}>Test Question</button>
      </div>
    );
  };
});

// Mock ChatMessage to avoid react-markdown dependency issues
jest.mock('@/components/chat/ChatMessage', () => {
  return function MockChatMessage({ message }: { message: any }) {
    return (
      <div data-testid="chat-message">
        <div>{message.content}</div>
      </div>
    );
  };
});

// Mock InterruptConfirmation
jest.mock('@/components/chat/InterruptConfirmation', () => {
  return {
    InterruptConfirmation: function MockInterruptConfirmation() {
      return <div data-testid="interrupt-confirmation">Interrupt Confirmation</div>;
    }
  };
});

// Mock ModelProviderRetryPopup
jest.mock('@/components/chat/ModelProviderRetryPopup', () => {
  return function MockModelProviderRetryPopup() {
    return <div data-testid="model-provider-retry-popup">Retry Popup</div>;
  };
});

describe('Chat Close Button Functionality', () => {
  const defaultProps = {
    accountId: 'test-account-id',
    userId: 'test-user-id',
    onClose: jest.fn(),
    isLimitReached: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Regular Mode (Floating Chat)', () => {
    it('should show close button in header for regular mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      // Should have header with close button
      expect(screen.getByTestId('clera-avatar')).toBeInTheDocument();
      
      // Find close button by aria-label
      const closeButton = screen.getByLabelText('Close chat');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toBeVisible();
    });

    it('should call onClose when close button is clicked in regular mode', () => {
      const mockOnClose = jest.fn();
      
      render(
        <Chat
          {...defaultProps}
          onClose={mockOnClose}
          isFullscreen={false}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should hide close button when showCloseButton is false in regular mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={false}
          showCloseButton={false}
        />
      );

      // Header should still be there but no close button
      expect(screen.getByTestId('clera-avatar')).toBeInTheDocument();
      expect(screen.queryByLabelText('Close chat')).not.toBeInTheDocument();
    });
  });

  describe('Fullscreen Mode', () => {
    it('should show close button as floating button in fullscreen mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      // Should not have header in fullscreen mode
      expect(screen.queryByTestId('clera-avatar')).not.toBeInTheDocument();
      
      // Should have floating close button
      const closeButton = screen.getByLabelText('Close chat');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toBeVisible();
      
      // Check that it has the right styling (absolute positioning)
      expect(closeButton).toHaveClass('absolute', 'top-2', 'right-2', 'z-10');
    });

    it('should call onClose when floating close button is clicked in fullscreen mode', () => {
      const mockOnClose = jest.fn();
      
      render(
        <Chat
          {...defaultProps}
          onClose={mockOnClose}
          isFullscreen={true}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should hide close button when showCloseButton is false in fullscreen mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          isSidebarMode={false}
          showCloseButton={false}
        />
      );

      expect(screen.queryByLabelText('Close chat')).not.toBeInTheDocument();
    });
  });

  describe('Sidebar Mode', () => {
    it('should show close button as floating button in sidebar mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={true}
          showCloseButton={true}
        />
      );

      // Should not have header in sidebar mode
      expect(screen.queryByTestId('clera-avatar')).not.toBeInTheDocument();
      
      // Should have floating close button
      const closeButton = screen.getByLabelText('Close chat');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toBeVisible();
      
      // Check that it has the right styling (absolute positioning)
      expect(closeButton).toHaveClass('absolute', 'top-2', 'right-2', 'z-10');
    });

    it('should call onClose when floating close button is clicked in sidebar mode', () => {
      const mockOnClose = jest.fn();
      
      render(
        <Chat
          {...defaultProps}
          onClose={mockOnClose}
          isFullscreen={false}
          isSidebarMode={true}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should hide close button when showCloseButton is false in sidebar mode', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={true}
          showCloseButton={false}
        />
      );

      expect(screen.queryByLabelText('Close chat')).not.toBeInTheDocument();
    });
  });

  describe('Default Props Behavior', () => {
    it('should show close button by default (showCloseButton defaults to true)', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={false}
          // Not passing showCloseButton prop - should default to true
        />
      );

      expect(screen.getByLabelText('Close chat')).toBeInTheDocument();
    });

    it('should show close button in fullscreen mode by default', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          isSidebarMode={false}
          // Not passing showCloseButton prop - should default to true
        />
      );

      expect(screen.getByLabelText('Close chat')).toBeInTheDocument();
    });

    it('should show close button in sidebar mode by default', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={true}
          // Not passing showCloseButton prop - should default to true
        />
      );

      expect(screen.getByLabelText('Close chat')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label on close button', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={false}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      expect(closeButton).toHaveAttribute('aria-label', 'Close chat');
    });

    it('should be keyboard accessible', () => {
      const mockOnClose = jest.fn();
      
      render(
        <Chat
          {...defaultProps}
          onClose={mockOnClose}
          isFullscreen={false}
          isSidebarMode={false}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      
      // Should be focusable
      closeButton.focus();
      expect(closeButton).toHaveFocus();
      
      // Should be triggerable with Enter key
      fireEvent.keyDown(closeButton, { key: 'Enter', code: 'Enter' });
      // Note: This test depends on the Button component implementation
      // The actual keyboard interaction might be handled by the Button component
    });
  });

  describe('Visual Styling', () => {
    it('should have correct styling for floating close button', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      
      // Check for expected classes
      expect(closeButton).toHaveClass(
        'absolute',
        'top-2',
        'right-2',
        'z-10',
        'bg-background/80',
        'hover:bg-background'
      );
    });

    it('should not interfere with other UI elements', () => {
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          showCloseButton={true}
        />
      );

      // The close button should have high z-index to float above content
      const closeButton = screen.getByLabelText('Close chat');
      expect(closeButton).toHaveClass('z-10');
      
      // Should have background to be visible over content
      expect(closeButton).toHaveClass('bg-background/80');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing onClose gracefully', () => {
      // This shouldn't happen in practice due to TypeScript, but test robustness
      render(
        <Chat
          {...defaultProps}
          onClose={undefined as any}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      
      // Should not throw error when clicked
      expect(() => {
        fireEvent.click(closeButton);
      }).not.toThrow();
    });

    it('should work correctly when both isFullscreen and isSidebarMode are true', () => {
      // This is an edge case that shouldn't happen, but test the behavior
      render(
        <Chat
          {...defaultProps}
          isFullscreen={true}
          isSidebarMode={true}
          showCloseButton={true}
        />
      );

      // Should still show the floating close button
      expect(screen.getByLabelText('Close chat')).toBeInTheDocument();
      
      // Should not show header
      expect(screen.queryByTestId('clera-avatar')).not.toBeInTheDocument();
    });

    it('should handle rapid clicks gracefully', () => {
      const mockOnClose = jest.fn();
      
      render(
        <Chat
          {...defaultProps}
          onClose={mockOnClose}
          showCloseButton={true}
        />
      );

      const closeButton = screen.getByLabelText('Close chat');
      
      // Simulate rapid clicks
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);

      // Should call onClose for each click
      expect(mockOnClose).toHaveBeenCalledTimes(3);
    });
  });
});
