/**
 * Unit tests for TimelineRenderer components
 * Tests timeline visualization and responsiveness
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { 
  TimelineRenderer, 
  CompactTimelineRenderer, 
  DetailedTimelineRenderer 
} from '@/components/chat/TimelineRenderer';
import { TimelineStep } from '@/types/chat';

describe('TimelineRenderer', () => {
  const mockSteps: TimelineStep[] = [
    {
      id: '1',
      label: 'Researching market information',
      isComplete: true,
      isLast: false,
      timestamp: Date.now() - 2000
    },
    {
      id: '2',
      label: 'Looking at your portfolio',
      isComplete: true,
      isLast: false,
      timestamp: Date.now() - 1000
    },
    {
      id: '3',
      label: 'Done',
      isComplete: true,
      isLast: true,
      timestamp: Date.now()
    }
  ];

  describe('basic rendering', () => {
    it('should render timeline steps correctly', () => {
      render(<TimelineRenderer steps={mockSteps} />);

      expect(screen.getByText('Researching market information')).toBeInTheDocument();
      expect(screen.getByText('Looking at your portfolio')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should render nothing when steps are empty', () => {
      const { container } = render(<TimelineRenderer steps={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('should render nothing when steps are null/undefined', () => {
      // @ts-ignore - testing runtime behavior
      const { container: container1 } = render(<TimelineRenderer steps={null} />);
      expect(container1.firstChild).toBeNull();

      // @ts-ignore - testing runtime behavior
      const { container: container2 } = render(<TimelineRenderer steps={undefined} />);
      expect(container2.firstChild).toBeNull();
    });

    it('should show checkmark for Done step', () => {
      render(<TimelineRenderer steps={mockSteps} />);
      
      // The Done step should have a checkmark
      const doneStep = screen.getByText('Done').closest('li');
      expect(doneStep?.textContent).toContain('✓');
    });

    it('should apply correct CSS classes for completed and incomplete steps', () => {
      const mixedSteps: TimelineStep[] = [
        { id: '1', label: 'Completed step', isComplete: true, isLast: false },
        { id: '2', label: 'Running step', isComplete: false, isLast: true }
      ];

      const { container } = render(<TimelineRenderer steps={mixedSteps} />);
      
      // Should have different styling for completed vs incomplete (all grey now)
      const completedNode = container.querySelector('.border-gray-400');
      const incompleteNode = container.querySelector('.border-gray-300');
      
      expect(completedNode).toBeTruthy();
      expect(incompleteNode).toBeTruthy();
    });
  });

  describe('customization options', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <TimelineRenderer steps={mockSteps} className="custom-timeline" />
      );
      
      expect(container.querySelector('.custom-timeline')).toBeTruthy();
    });

    it('should support different node sizes', () => {
      const { container: smContainer } = render(
        <TimelineRenderer steps={mockSteps} nodeSize="sm" />
      );
      const { container: lgContainer } = render(
        <TimelineRenderer steps={mockSteps} nodeSize="lg" />
      );
      
      expect(smContainer.querySelector('.h-3')).toBeTruthy();
      expect(lgContainer.querySelector('.h-5')).toBeTruthy();
    });

    it('should show timestamps when enabled', () => {
      render(<TimelineRenderer steps={mockSteps} showTimestamps={true} />);
      
      // Should show time in HH:MM format
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
      expect(timeElements.length).toBeGreaterThan(0);
    });

    it('should use custom color scheme', () => {
      const customColors = {
        completedNode: 'border-blue-500 bg-blue-500',
        incompleteNode: 'border-red-300 bg-white',
        runningNode: 'border-yellow-500 bg-yellow-500',
        completedText: 'text-blue-900',
        incompleteText: 'text-red-500',
        line: 'bg-blue-200'
      };

      const { container } = render(
        <TimelineRenderer steps={mockSteps} colorScheme={customColors} />
      );
      
      expect(container.querySelector('.border-blue-500')).toBeTruthy();
    });

    it('should use custom step renderer when provided', () => {
      const customRenderer = (step: TimelineStep, index: number) => (
        <li key={step.id} data-testid={`custom-step-${index}`}>
          Custom: {step.label}
        </li>
      );

      render(<TimelineRenderer steps={mockSteps} renderStep={customRenderer} />);
      
      expect(screen.getByTestId('custom-step-0')).toBeInTheDocument();
      expect(screen.getByText('Custom: Researching market information')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('should apply compact styling', () => {
      const { container } = render(
        <TimelineRenderer steps={mockSteps} compact={true} />
      );
      
      // Should have smaller margins and text
      expect(container.querySelector('.mb-2')).toBeTruthy();
      expect(container.querySelector('.text-xs')).toBeTruthy();
    });
  });

  describe('responsive behavior', () => {
    it('should handle single step timeline', () => {
      const singleStep: TimelineStep[] = [
        { id: '1', label: 'Only step', isComplete: true, isLast: true }
      ];

      render(<TimelineRenderer steps={singleStep} />);
      
      expect(screen.getByText('Only step')).toBeInTheDocument();
    });

    it('should handle very long step labels', () => {
      const longLabelSteps: TimelineStep[] = [
        { 
          id: '1', 
          label: 'This is a very long step label that might wrap to multiple lines in smaller containers',
          isComplete: true,
          isLast: true 
        }
      ];

      render(<TimelineRenderer steps={longLabelSteps} />);
      
      expect(screen.getByText(/This is a very long step label/)).toBeInTheDocument();
    });
  });

  describe('timeline variants', () => {
    it('should render CompactTimelineRenderer correctly', () => {
      const { container } = render(<CompactTimelineRenderer steps={mockSteps} />);
      
      // Should automatically apply compact mode
      expect(container.querySelector('.text-xs')).toBeTruthy();
      expect(container.querySelector('.h-3')).toBeTruthy(); // Small node size
    });

    it('should render DetailedTimelineRenderer with timestamps', () => {
      render(<DetailedTimelineRenderer steps={mockSteps} />);
      
      // Should automatically show timestamps
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(<TimelineRenderer steps={mockSteps} />);
      
      // Timeline should be an ordered list
      expect(container.querySelector('ol')).toBeTruthy();
      
      // Decorative lines should be hidden from screen readers
      expect(container.querySelector('[aria-hidden]')).toBeTruthy();
    });

    it('should have semantic list structure', () => {
      render(<TimelineRenderer steps={mockSteps} />);
      
      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(mockSteps.length);
    });
  });

  describe('edge cases', () => {
    it('should handle steps without timestamps', () => {
      const stepsNoTimestamp: TimelineStep[] = [
        { id: '1', label: 'No timestamp', isComplete: true, isLast: true }
      ];

      render(<TimelineRenderer steps={stepsNoTimestamp} showTimestamps={true} />);
      
      // Should not crash and should still render the step
      expect(screen.getByText('No timestamp')).toBeInTheDocument();
    });

    it('should handle malformed step data gracefully', () => {
      const malformedSteps = [
        { id: '', label: '', isComplete: true, isLast: true }
      ] as TimelineStep[];

      // Should not crash
      expect(() => {
        render(<TimelineRenderer steps={malformedSteps} />);
      }).not.toThrow();
    });

    it('should handle very large number of steps', () => {
      const manySteps: TimelineStep[] = Array.from({ length: 100 }, (_, i) => ({
        id: i.toString(),
        label: `Step ${i + 1}`,
        isComplete: true,
        isLast: i === 99
      }));

      render(<TimelineRenderer steps={manySteps} />);
      
      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Step 100')).toBeInTheDocument();
    });
  });
});
