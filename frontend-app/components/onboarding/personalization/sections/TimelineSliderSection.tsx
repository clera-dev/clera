"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { 
  InvestmentTimeline, 
  INVESTMENT_TIMELINE_DESCRIPTIONS 
} from "@/lib/types/personalization";

interface TimelineSliderSectionProps {
  selectedTimeline: InvestmentTimeline | '';
  onChange: (timeline: InvestmentTimeline) => void;
  tempIndex?: number | null;
  onSliderChange?: (values: number[]) => void;
  onSliderCommit?: (values: number[]) => void;
  error?: string;
  onClearError?: () => void;
}

const TIMELINE_OPTIONS: InvestmentTimeline[] = [
  InvestmentTimeline.LESS_THAN_1_YEAR,
  InvestmentTimeline.ONE_TO_THREE_YEARS, 
  InvestmentTimeline.THREE_TO_FIVE_YEARS,
  InvestmentTimeline.FIVE_TO_TEN_YEARS,
  InvestmentTimeline.TEN_PLUS_YEARS
];

/**
 * Investment timeline slider section for personalization form
 * Single selection using a slider interface
 */
export function TimelineSliderSection({ 
  selectedTimeline, 
  onChange, 
  tempIndex,
  onSliderChange,
  onSliderCommit,
  error, 
  onClearError 
}: TimelineSliderSectionProps) {
  const currentIndex = selectedTimeline 
    ? TIMELINE_OPTIONS.indexOf(selectedTimeline)
    : 0;
  
  const displayIndex = tempIndex ?? currentIndex;
  const displayTimeline = TIMELINE_OPTIONS[displayIndex];
  const displayText = displayTimeline ? INVESTMENT_TIMELINE_DESCRIPTIONS[displayTimeline] : 'Select timeline';

  const handleSliderChange = (values: number[]) => {
    if (onSliderChange) {
      onSliderChange(values);
    }
  };

  const handleSliderCommit = (values: number[]) => {
    const newTimeline = TIMELINE_OPTIONS[values[0]];
    
    // Clear error when user makes a selection
    if (onClearError) {
      onClearError();
    }
    
    onChange(newTimeline);
    
    if (onSliderCommit) {
      onSliderCommit(values);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white mb-2">
          How long do you plan to be investing for?
        </h2>
        <p className="text-white">
          Your investment timeline helps determine the right strategy
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        {/* Selected timeline display */}
        <div className="text-center">
          <div className={cn(
            "text-2xl font-bold text-primary mb-2",
            error && "text-red-600"
          )}>
            {displayText || 'Select timeline'}
          </div>
          <div className="text-sm text-gray-500">
            Investment Timeline
          </div>
        </div>

        {/* Slider */}
        <div className="px-4">
          <Slider
            value={[displayIndex]}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            max={TIMELINE_OPTIONS.length - 1}
            min={0}
            step={1}
            className={cn(
              "w-full",
              error && "accent-red-500"
            )}
          />
          
          {/* Timeline labels */}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>&lt;1 year</span>
            <span>1-3 years</span>
            <span>3-5 years</span>
            <span>5-10 years</span>
            <span>10+ years</span>
          </div>
        </div>

        {error && (
          <div className="text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
