"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
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
  const unsafeIndex = selectedTimeline
    ? TIMELINE_OPTIONS.indexOf(selectedTimeline)
    : 0;
  const currentIndex = unsafeIndex >= 0 ? unsafeIndex : 0;
  const clampedTempIndex = typeof tempIndex === 'number'
    ? Math.min(TIMELINE_OPTIONS.length - 1, Math.max(0, tempIndex))
    : null;
  
  const displayIndex = clampedTempIndex ?? currentIndex;
  const displayTimeline = TIMELINE_OPTIONS[displayIndex];
  const displayText = displayTimeline ? INVESTMENT_TIMELINE_DESCRIPTIONS[displayTimeline] : 'Select timeline';

  const handleSliderChange = (values: number[]) => {
    const idx = Math.min(TIMELINE_OPTIONS.length - 1, Math.max(0, (values && values[0] != null ? values[0] : 0)));
    if (onSliderChange) onSliderChange([idx]);
  };

  const handleSliderCommit = (values: number[]) => {
    const idx = Math.min(TIMELINE_OPTIONS.length - 1, Math.max(0, (values && values[0] != null ? values[0] : 0)));
    const newTimeline = TIMELINE_OPTIONS[idx];
    
    // Clear error when user makes a selection
    if (onClearError) {
      onClearError();
    }
    
    onChange(newTimeline);
    
    if (onSliderCommit) onSliderCommit([idx]);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white mb-2">
          What's your investment timeline?
        </h2>
        <p className="text-gray-300 mb-4">
          When do you expect to need this money?
        </p>
        
        {/* Why we ask context box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-gray-300">
          <Info className="h-4 w-4 text-primary" />
          <span>Longer timelines allow for more growth-focused strategies</span>
        </div>
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
