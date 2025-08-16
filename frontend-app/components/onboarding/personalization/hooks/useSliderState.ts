"use client";

import { useState, useCallback } from "react";

export interface UseSliderStateReturn {
  tempTimelineIndex: number | null;
  tempMonthlyValue: number | null;
  setTempTimelineIndex: (index: number | null) => void;
  setTempMonthlyValue: (value: number | null) => void;
  handleTimelineChange: (values: number[]) => void;
  handleTimelineCommit: (values: number[], onUpdate: (index: number) => void) => void;
  handleMonthlyGoalChange: (values: number[]) => void;
  handleMonthlyGoalCommit: (values: number[], onUpdate: (value: number) => void) => void;
}

/**
 * Custom hook for managing slider state with smooth desktop dragging
 * Prevents UI jank by using temporary state during drag operations
 */
export function useSliderState(): UseSliderStateReturn {
  const [tempTimelineIndex, setTempTimelineIndex] = useState<number | null>(null);
  const [tempMonthlyValue, setTempMonthlyValue] = useState<number | null>(null);

  const handleTimelineChange = useCallback((values: number[]) => {
    setTempTimelineIndex(values[0]);
  }, []);

  const handleTimelineCommit = useCallback((
    values: number[],
    onUpdate: (index: number) => void
  ) => {
    onUpdate(values[0]);
    setTempTimelineIndex(null);
  }, []);

  const handleMonthlyGoalChange = useCallback((values: number[]) => {
    // Snap to $1 then multiples of $25
    let snappedValue = values[0];
    if (snappedValue > 1) {
      snappedValue = Math.round((snappedValue - 1) / 25) * 25 + 1;
    }
    setTempMonthlyValue(snappedValue);
  }, []);

  const handleMonthlyGoalCommit = useCallback((
    values: number[],
    onUpdate: (value: number) => void
  ) => {
    // Apply same snapping logic on commit
    let snappedValue = values[0];
    if (snappedValue > 1) {
      snappedValue = Math.round((snappedValue - 1) / 25) * 25 + 1;
    }
    
    onUpdate(snappedValue);
    setTempMonthlyValue(null);
  }, []);

  return {
    tempTimelineIndex,
    tempMonthlyValue,
    setTempTimelineIndex,
    setTempMonthlyValue,
    handleTimelineChange,
    handleTimelineCommit,
    handleMonthlyGoalChange,
    handleMonthlyGoalCommit,
  };
}
