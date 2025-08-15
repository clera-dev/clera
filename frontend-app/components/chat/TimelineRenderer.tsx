/**
 * TimelineRenderer - Reusable timeline visualization component
 * 
 * This component follows the Single Responsibility Principle by handling only
 * the visual rendering of timeline data. It's designed to be reusable across
 * different contexts and responsive to different screen sizes.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { TimelineStep } from '@/types/chat';

export interface TimelineRendererProps {
  /** Timeline steps to render */
  steps: TimelineStep[];
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Custom node size */
  nodeSize?: 'sm' | 'md' | 'lg';
  /** Custom color scheme */
  colorScheme?: {
    completedNode: string;
    incompleteNode: string;
    runningNode: string;
    completedText: string;
    incompleteText: string;
    line: string;
  };
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Custom step renderer for advanced use cases */
  renderStep?: (step: TimelineStep, index: number) => React.ReactNode;
}

const DEFAULT_COLOR_SCHEME = {
  completedNode: 'border-gray-400 bg-gray-400',
  incompleteNode: 'border-gray-300 bg-white',
  runningNode: 'border-gray-400 bg-gray-400',
  completedText: 'text-foreground',
  incompleteText: 'text-muted-foreground',
  line: 'bg-gray-300'
};

const NODE_SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5'
};

export const TimelineRenderer: React.FC<TimelineRendererProps> = ({
  steps,
  compact = false,
  className,
  nodeSize = 'md',
  colorScheme = DEFAULT_COLOR_SCHEME,
  showTimestamps = false,
  renderStep
}) => {
  if (!steps || steps.length === 0) {
    return null;
  }

  const colors = { ...DEFAULT_COLOR_SCHEME, ...colorScheme };
  const nodeClass = NODE_SIZES[nodeSize];

  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const renderDefaultStep = (step: TimelineStep, index: number): React.ReactNode => (
    <li key={step.id} className={cn('mb-3 last:mb-0', compact && 'mb-2')}>
      {/* Vertical line (except for last item) */}
      {!step.isLast && (
        <div 
          className={cn(
            'absolute left-2 top-6 bottom-0 w-px',
            colors.line,
            compact && 'top-5'
          )} 
          aria-hidden 
        />
      )}
      
      <div className="relative flex items-start">
        {/* Timeline node */}
        <span
          className={cn(
            'absolute left-0 top-1 flex items-center justify-center rounded-full border-2 z-10',
            nodeClass,
            // All nodes are light grey, but running ones pulse
            step.isRunning 
              ? `${colors.runningNode} animate-pulse` 
              : step.isComplete 
                ? colors.completedNode 
                : colors.incompleteNode,
            compact && 'top-0.5'
          )}
        >
          {step.isComplete && step.label === 'Done' && (
            <span className="text-white text-xs">✓</span>
          )}
        </span>
        
        {/* Step content */}
        <div className={cn('ml-6', compact && 'ml-5')}>
          <span 
            className={cn(
              compact ? 'text-xs' : 'text-sm',
              step.isComplete ? colors.completedText : colors.incompleteText
            )}
          >
            {step.label}
          </span>
          
          {/* Optional timestamp */}
          {showTimestamps && step.timestamp && (
            <div className={cn(
              'text-xs text-muted-foreground mt-0.5',
              compact && 'text-xs'
            )}>
              {formatTimestamp(step.timestamp)}
            </div>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <div className={cn('mt-2', className)}>
      <ol className={cn('relative', compact ? 'ml-3' : 'ml-4')}>
        {steps.map((step, index) => 
          renderStep ? renderStep(step, index) : renderDefaultStep(step, index)
        )}
      </ol>
    </div>
  );
};

/**
 * Compact timeline variant optimized for mobile/sidebar use
 */
export const CompactTimelineRenderer: React.FC<Omit<TimelineRendererProps, 'compact'>> = (props) => (
  <TimelineRenderer {...props} compact={true} nodeSize="sm" />
);

/**
 * Detailed timeline variant with timestamps
 */
export const DetailedTimelineRenderer: React.FC<Omit<TimelineRendererProps, 'showTimestamps'>> = (props) => (
  <TimelineRenderer {...props} showTimestamps={true} />
);

export default TimelineRenderer;
