/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import SuggestedQuestions from '@/components/chat/SuggestedQuestions';

// Mock window.innerWidth for mobile detection
const mockInnerWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
};

describe('Mobile Suggested Questions', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    // Reset to desktop width
    mockInnerWidth(1024);
    jest.clearAllMocks();
  });

  describe('Desktop Layout', () => {
    test('should use original layout on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      
      // Should use original grid layout classes
      expect(container).toHaveClass('grid-cols-1');
      expect(container).toHaveClass('md:grid-cols-2');
      expect(container).not.toHaveClass('grid-cols-2');
      expect(container).not.toHaveClass('grid-rows-3');
    });

    test('should use larger text and padding on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const button = screen.getByText('How is this account split between stocks and bonds?').closest('button');
      
      // Should have desktop classes
      expect(button).toHaveClass('py-3');
      expect(button).toHaveClass('px-4');
      expect(button).toHaveClass('text-sm');
    });
  });

  describe('Mobile Layout', () => {
    test('should use compact 3x2 grid on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      
      // Should use mobile grid layout classes
      expect(container).toHaveClass('grid-cols-2');
      expect(container).toHaveClass('grid-rows-3');
      expect(container).not.toHaveClass('grid-cols-1');
      expect(container).not.toHaveClass('md:grid-cols-2');
    });

    test('should use smaller text and padding on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const button = screen.getByText('How is this account split between stocks and bonds?').closest('button');
      
      // Should have mobile classes
      expect(button).toHaveClass('py-2');
      expect(button).toHaveClass('px-3');
      expect(button).toHaveClass('text-xs');
    });

    test('should add mobile-specific CSS class on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const outerContainer = screen.getByText('How is this account split between stocks and bonds?').closest('.mobile-suggested-questions');
      
      expect(outerContainer).toBeInTheDocument();
      expect(outerContainer).toHaveClass('mobile-suggested-questions');
    });

    test('should not add mobile CSS class on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const outerContainer = screen.getByText('How is this account split between stocks and bonds?').closest('.px-3');
      
      expect(outerContainer).not.toHaveClass('mobile-suggested-questions');
    });
  });

  describe('Responsive Behavior', () => {
    test('should update layout when resizing from desktop to mobile', () => {
      // Start desktop
      mockInnerWidth(1024);

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      let container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-1');

      // Resize to mobile
      act(() => {
        mockInnerWidth(375);
      });

      container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-2');
      expect(container).toHaveClass('grid-rows-3');
    });

    test('should update layout when resizing from mobile to desktop', () => {
      // Start mobile
      mockInnerWidth(375);

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      let container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-2');

      // Resize to desktop
      act(() => {
        mockInnerWidth(1024);
      });

      container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-1');
      expect(container).toHaveClass('md:grid-cols-2');
    });
  });

  describe('Question Layout', () => {
    test('should render all 6 questions in 3x2 grid on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      // Check that all 6 questions are rendered
      expect(screen.getByText('How is this account split between stocks and bonds?')).toBeInTheDocument();
      expect(screen.getByText('What news is impacting my portfolio today?')).toBeInTheDocument();
      expect(screen.getByText('How can I diversify better?')).toBeInTheDocument();
      expect(screen.getByText('How can I improve my risk score?')).toBeInTheDocument();
      expect(screen.getByText('Can you optimize my portfolio?')).toBeInTheDocument();
      expect(screen.getByText('What is my worst performing investment?')).toBeInTheDocument();

      // Grid should be 2 columns, 3 rows
      const container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-2');
      expect(container).toHaveClass('grid-rows-3');
    });

    test('should render all 6 questions with proper spacing on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      // Check that all 6 questions are rendered
      expect(screen.getByText('How is this account split between stocks and bonds?')).toBeInTheDocument();
      expect(screen.getByText('What news is impacting my portfolio today?')).toBeInTheDocument();
      expect(screen.getByText('How can I diversify better?')).toBeInTheDocument();
      expect(screen.getByText('How can I improve my risk score?')).toBeInTheDocument();
      expect(screen.getByText('Can you optimize my portfolio?')).toBeInTheDocument();
      expect(screen.getByText('What is my worst performing investment?')).toBeInTheDocument();

      // Grid should be 1 column on mobile, 2 on medium+
      const container = screen.getByText('How is this account split between stocks and bonds?').closest('.grid');
      expect(container).toHaveClass('grid-cols-1');
      expect(container).toHaveClass('md:grid-cols-2');
    });
  });

  describe('Interaction', () => {
    test('should call onSelect when question is clicked on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const question = screen.getByText('How can I diversify better?');
      fireEvent.click(question);

      expect(mockOnSelect).toHaveBeenCalledWith('How can I diversify better?');
    });

    test('should call onSelect when question is clicked on desktop', () => {
      mockInnerWidth(1024); // Desktop width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const question = screen.getByText('Can you optimize my portfolio?');
      fireEvent.click(question);

      expect(mockOnSelect).toHaveBeenCalledWith('Can you optimize my portfolio?');
    });

    test('should have proper hover states on both mobile and desktop', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const button = screen.getByText('How can I diversify better?').closest('button');
      expect(button).toHaveClass('hover:bg-zinc-800');
      expect(button).toHaveClass('transition-colors');
    });
  });

  describe('Accessibility', () => {
    test('should have proper text contrast and readability on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const button = screen.getByText('How can I diversify better?').closest('button');
      const span = button.querySelector('span');
      
      expect(span).toHaveClass('text-white');
      expect(span).toHaveClass('font-medium');
      expect(span).toHaveClass('leading-tight'); // For better mobile readability
    });

    test('should maintain button accessibility on mobile', () => {
      mockInnerWidth(375); // Mobile width

      render(<SuggestedQuestions onSelect={mockOnSelect} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(6);

      // All buttons should be properly sized for touch
      buttons.forEach(button => {
        expect(button).toHaveClass('py-2'); // Minimum touch target
        expect(button).toHaveClass('px-3');
      });
    });
  });

  describe('Event Cleanup', () => {
    test('should cleanup resize event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = render(<SuggestedQuestions onSelect={mockOnSelect} />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
    });
  });
});
