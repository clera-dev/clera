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

  // Single source of truth for monthly goal snapping logic
  const snapMonthly = useCallback((raw: number): number => {
    if (raw <= 1) return 1;
    // Snap to nearest multiple of $25
    return Math.round(raw / 25) * 25;
  }, []);

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
    setTempMonthlyValue(snapMonthly(values[0]));
  }, [snapMonthly]);

  const handleMonthlyGoalCommit = useCallback((
    values: number[],
    onUpdate: (value: number) => void
  ) => {
    // Prefer the already-snapped temp value to avoid drift
    const snapped = tempMonthlyValue != null ? tempMonthlyValue : snapMonthly(values[0]);
    onUpdate(snapped);
    setTempMonthlyValue(null);
  }, [tempMonthlyValue, snapMonthly]);

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
