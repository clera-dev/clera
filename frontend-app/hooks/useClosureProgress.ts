import { useState, useEffect, useCallback } from 'react';
import { accountClosureService, ClosureStep, ProgressResponse } from '@/utils/services/accountClosureService';

export interface UseClosureProgressReturn {
  closureSteps: ClosureStep[];
  lastUpdateStatus: 'loading' | 'success' | 'error';
  isRetrying: boolean;
  autoRetryEnabled: boolean;
  nextRetryIn: number | null;
  hasFailed: boolean;
  isInProgress: boolean;
  handleRetryResume: () => Promise<void>;
  refreshProgress: () => Promise<void>;
}

/**
 * Custom hook for managing closure progress polling and retry logic
 * Handles step state management, auto-refresh, and retry mechanisms
 */
export function useClosureProgress(userId: string): UseClosureProgressReturn {
  const [closureSteps, setClosureSteps] = useState<ClosureStep[]>(() => 
    accountClosureService.getInitialClosureSteps()
  );
  const [lastUpdateStatus, setLastUpdateStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);

  // Derived state
  const hasFailed = closureSteps.some(step => step.status === 'failed');
  const isInProgress = closureSteps.some(step => step.status === 'in-progress');

  /**
   * Fetch closure progress and update steps
   */
  const fetchClosureProgress = useCallback(async (): Promise<void> => {
    try {
      setLastUpdateStatus('loading');
      
      const progressData = await accountClosureService.fetchClosureProgress(userId);
      
      if (progressData) {
        // Update closure steps based on progress
        setClosureSteps(currentSteps => {
          const updatedSteps = accountClosureService.updateClosureSteps(currentSteps, progressData);
          return updatedSteps;
        });
        
        setLastUpdateStatus('success');
      } else {
        setLastUpdateStatus('error');
      }
    } catch (error) {
      console.error('[useClosureProgress] Error fetching closure progress:', error);
      setLastUpdateStatus('error');
    }
  }, [userId]);

  /**
   * Handle retry/resume process
   */
  const handleRetryResume = useCallback(async (): Promise<void> => {
    try {
      setIsRetrying(true);
      
      const result = await accountClosureService.retryClosureProcess(userId);
      
      if (result.success) {
        console.log('[useClosureProgress] Resume successful, action taken:', result.action_taken);
        
        // Immediately refresh progress
        setTimeout(() => {
          fetchClosureProgress();
        }, 1000);
        
        setAutoRetryEnabled(false);
        setNextRetryIn(null);
      } else if (result.can_retry && result.next_retry_in_seconds) {
        console.log('[useClosureProgress] Setting up auto-retry in', result.next_retry_in_seconds, 'seconds');
        setAutoRetryEnabled(true);
        setNextRetryIn(result.next_retry_in_seconds);
      }
    } catch (error) {
      console.error('[useClosureProgress] Error during retry/resume:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [userId, fetchClosureProgress]);

  // Auto-retry countdown effect
  useEffect(() => {
    if (autoRetryEnabled && nextRetryIn !== null && nextRetryIn > 0) {
      const countdown = setInterval(() => {
        setNextRetryIn(prev => {
          if (prev === null || prev <= 1) {
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdown);
    }
  }, [autoRetryEnabled, nextRetryIn]);

  // Trigger retry when countdown reaches zero
  useEffect(() => {
    if (autoRetryEnabled && nextRetryIn === 0) {
      setAutoRetryEnabled(false);
      handleRetryResume();
    }
  }, [autoRetryEnabled, nextRetryIn, handleRetryResume]);

  // Initial load and polling effect
  useEffect(() => {
    fetchClosureProgress();
    
    // Poll for progress updates every 60 seconds
    const progressInterval = setInterval(fetchClosureProgress, 60000);
    
    return () => clearInterval(progressInterval);
  }, [fetchClosureProgress]);

  return {
    closureSteps,
    lastUpdateStatus,
    isRetrying,
    autoRetryEnabled,
    nextRetryIn,
    hasFailed,
    isInProgress,
    handleRetryResume,
    refreshProgress: fetchClosureProgress
  };
} 