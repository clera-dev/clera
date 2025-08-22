import { useState, useCallback } from 'react';
import { queryLimitService } from '@/utils/services/QueryLimitService';

/**
 * Hook for managing query limits with proper separation of concerns.
 * Encapsulates all query limit business logic away from UI components.
 */
export function useQueryLimit(userId: string) {
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [nextResetTime, setNextResetTime] = useState<string>('');

  /**
   * Checks if a query can proceed based on daily limits.
   * Shows limit popup if exceeded.
   * 
   * @returns Promise<boolean> - true if query can proceed, false if blocked
   */
  const checkCanProceed = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      console.error('useQueryLimit: userId required for limit check');
      return false;
    }

    try {
      const limitCheck = await queryLimitService.checkQueryLimit(userId);
      if (!limitCheck.canProceed) {
        // Show limit popup with next reset time
        setNextResetTime(limitCheck.nextResetTime);
        setShowLimitPopup(true);
        console.log(`Query blocked: User ${userId} has reached daily limit (${limitCheck.currentCount}/${limitCheck.limit})`);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking query limit:', error);
      // Fail-safe: if limit check fails, show popup to prevent potential abuse
      setNextResetTime(queryLimitService.getNextResetTime());
      setShowLimitPopup(true);
      return false;
    }
  }, [userId]);

  /**
   * Dismisses the limit popup.
   */
  const dismissPopup = useCallback(() => {
    setShowLimitPopup(false);
  }, []);

  return {
    checkCanProceed,
    showLimitPopup,
    nextResetTime,
    dismissPopup,
  };
}
