import { useState } from 'react';
import { TimelineBuilder } from '@/utils/services/TimelineBuilder';
import { TimelineRenderer } from './TimelineRenderer';
import { cn } from '@/lib/utils';

interface PerMessageToolDetailsProps {
  runId: string;
  activities: any[];
  isMobile: boolean;
  isFullscreen: boolean;
  isSidebarMode?: boolean;
  timelineBuilder: TimelineBuilder;
}

/**
 * Collapsible tool details component for displaying timeline activities per user message.
 * Extracted from Chat.tsx to follow Single Responsibility Principle.
 */
export function PerMessageToolDetails({
  runId,
  activities,
  isMobile,
  isFullscreen,
  isSidebarMode,
  timelineBuilder,
}: PerMessageToolDetailsProps) {
  const [open, setOpen] = useState<boolean>(false);
  
  // Use TimelineBuilder to construct timeline steps
  const timelineSteps = timelineBuilder.buildTimelineForRun(activities, runId);
  
  if (timelineSteps.length === 0) return null;
  
  return (
    <div className={cn(
      "mt-3 mb-3",
      // Match the padding/margin of assistant messages to align with Clera's text
      isMobile ? "px-3" : isSidebarMode ? "px-3" : "px-3"
    )}>
      <button
        type="button"
        className="text-foreground text-sm hover:text-primary transition-colors inline-flex items-center gap-1 mb-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{open ? 'Hide details' : 'Show details'}</span>
        <span className={cn('transition-transform', open ? 'rotate-90' : '')}>›</span>
      </button>
      {open && (
        <TimelineRenderer 
          steps={timelineSteps}
          compact={isMobile || isSidebarMode}
          className="mt-2"
        />
      )}
    </div>
  );
}
