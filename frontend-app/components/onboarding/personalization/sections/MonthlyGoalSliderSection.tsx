"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface MonthlyGoalSliderSectionProps {
  selectedGoal: number;
  onChange: (goal: number) => void;
  tempValue?: number | null;
  onSliderChange?: (values: number[]) => void;
  onSliderCommit?: (values: number[]) => void;
  error?: string;
  onClearError?: () => void;
}

/**
 * Monthly investment goal slider section for personalization form
 * Single-value slider with snapping to $1 then multiples of $25
 */
export function MonthlyGoalSliderSection({ 
  selectedGoal, 
  onChange, 
  tempValue,
  onSliderChange,
  onSliderCommit,
  error, 
  onClearError 
}: MonthlyGoalSliderSectionProps) {
  const displayValue = tempValue ?? selectedGoal;
  
  const formatDisplayValue = (value: number): string => {
    if (value >= 1000) {
      return "$1,000+";
    }
    return `$${value.toLocaleString()}`;
  };

  const handleSliderChange = (values: number[]) => {
    if (onSliderChange) {
      onSliderChange(values);
    }
  };

  const handleSliderCommit = (values: number[]) => {
    // Clear error when user makes a selection
    if (onClearError) {
      onClearError();
    }

    const [val] = values;
    // Snap: $1 allowed, otherwise multiples of $25 between $25 and $1,000
    const snapped = (() => {
      if (val <= 1) return 1;
      const rounded = Math.round(val / 25) * 25;
      return Math.min(1000, Math.max(25, rounded));
    })();

    // Notify parent of the committed (snapped) value
    onChange(snapped);

    // Forward snapped value to optional commit handler
    if (onSliderCommit) {
      onSliderCommit([snapped]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white mb-2">
          How much do you plan to invest each month?
        </h2>
        <p className="text-gray-300 mb-4">
          Just a rough estimate — you can always change this later
        </p>
        
        {/* Why we ask context box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-gray-300 mb-2">
          <Info className="h-4 w-4 text-primary" />
          <span>This helps me suggest realistic portfolio-building strategies</span>
        </div>
        
        <p className="text-xs text-gray-500">
          Don't worry — Clera will never move money without your approval
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        {/* Selected goal display */}
        <div className="text-center">
          <div className={cn(
            "text-3xl font-bold text-primary mb-2",
            error && "text-red-600"
          )}>
            {formatDisplayValue(displayValue)}
          </div>
          <div className="text-sm text-gray-500">
            Monthly Investment Goal
          </div>
        </div>

        {/* Slider */}
        <div className="px-4">
          <Slider
            value={[displayValue]}
            onValueChange={handleSliderChange}
            onValueCommit={handleSliderCommit}
            max={1000}
            min={1}
            step={1}
            className={cn(
              "w-full",
              error && "accent-red-500"
            )}
          />
          
          {/* Range labels */}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>$1</span>
            <span>$500</span>
            <span>$1,000+</span>
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
