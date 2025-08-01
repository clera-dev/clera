import { render, screen, fireEvent } from '@testing-library/react';
import ChatHistoryItem from '@/components/chat/history/ChatHistoryItem';
import { ChatSession } from '@/utils/api/chat-client';

// Mock the date-fns module
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '2 hours ago')
}));

describe('ChatHistoryItem', () => {
  const mockOnSelect = jest.fn();
  const mockOnDelete = jest.fn();

  const createMockSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
    id: 'test-session-1',
    title: 'Test Session',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T02:00:00Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello, how are you?'
      }
    ],
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Title Generation', () => {
    it('should display session title when available', () => {
      const session = createMockSession({ title: 'My Chat Session' });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('My Chat Session')).toBeInTheDocument();
    });

    it('should generate title from first message when session title is empty', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: 'This is a very long message that should be truncated'
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      // The component uses CSS truncation, so we check for partial text
      expect(screen.getByText(/This is a very long message/)).toBeInTheDocument();
    });

    it('should generate title from first message when session title is null', () => {
      const session = createMockSession({ 
        title: null as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: 'Short message'
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Short message')).toBeInTheDocument();
    });

    it('should generate title from first message when session title is undefined', () => {
      const session = createMockSession({ 
        title: undefined as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: 'Another message'
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Another message')).toBeInTheDocument();
    });

    it('should handle empty messages array gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: []
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should handle first message with null content gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: null as any
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should handle first message with undefined content gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: undefined as any
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should handle first message with empty string content gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: ''
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should truncate long message content to 30 characters', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: 'This is a very long message that exceeds thirty characters and should be truncated properly'
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      // Check for the actual truncated text as it appears in the DOM
      expect(screen.getByText('This is a very long message th...')).toBeInTheDocument();
    });
  });

  describe('Mobile Display', () => {
    it('should truncate title to 25 characters on mobile', () => {
      const session = createMockSession({ 
        title: 'This is a very long title that should be truncated on mobile devices'
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
          isMobile={true}
        />
      );

      // Check for the actual truncated text as it appears in the DOM
      expect(screen.getByText('This is a very long title...')).toBeInTheDocument();
    });

    it('should not truncate short titles on mobile', () => {
      const session = createMockSession({ 
        title: 'Short Title'
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
          isMobile={true}
        />
      );

      expect(screen.getByText('Short Title')).toBeInTheDocument();
    });

    it('should handle empty title gracefully on mobile', () => {
      const session = createMockSession({ 
        title: '',
        messages: []
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
          isMobile={true}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });
  });

  describe('Date Formatting', () => {
    it('should display formatted date on desktop', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
          isMobile={false}
        />
      );

      expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });

    it('should not display date on mobile', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
          isMobile={true}
        />
      );

      expect(screen.queryByText('2 hours ago')).not.toBeInTheDocument();
    });

    it('should handle invalid date gracefully', () => {
      const session = createMockSession({ 
        updatedAt: 'invalid-date'
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Recently')).toBeInTheDocument();
    });

    it('should handle missing updatedAt gracefully', () => {
      const session = createMockSession({ 
        updatedAt: null as any
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Recently')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should call onSelect when clicked', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByText('Test Session'));
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    it('should call onDelete when delete button is clicked', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      const deleteButton = screen.getByTitle('Delete conversation');
      fireEvent.click(deleteButton);
      
      expect(mockOnDelete).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).not.toHaveBeenCalled(); // Should not trigger onSelect
    });

    it('should apply active styling when isActive is true', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={true}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      // Find the main container div that has the styling classes
      const container = screen.getByText('Test Session').closest('div[class*="group"]');
      expect(container).toHaveClass('bg-accent', 'text-accent-foreground');
    });

    it('should apply hover styling when isActive is false', () => {
      const session = createMockSession();
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      // Find the main container div that has the styling classes
      const container = screen.getByText('Test Session').closest('div[class*="group"]');
      expect(container).toHaveClass('hover:bg-muted');
    });
  });

  describe('Edge Cases', () => {
    it('should handle session with null messages gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: null as any
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should handle session with undefined messages gracefully', () => {
      const session = createMockSession({ 
        title: '',
        messages: undefined as any
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('should handle very long message content that needs truncation', () => {
      const session = createMockSession({ 
        title: '',
        messages: [
          {
            id: 'msg-1',
            role: 'user' as const,
            content: 'A'.repeat(100) // 100 character string
          }
        ]
      });
      
      render(
        <ChatHistoryItem
          session={session}
          isActive={false}
          onSelect={mockOnSelect}
          onDelete={mockOnDelete}
        />
      );

      const expectedTitle = 'A'.repeat(30) + '...';
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });
  });
}); 