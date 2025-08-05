"use client";

import { useState } from 'react';
import { accountClosureService, ClosureState, ClosureStep } from '@/utils/services/accountClosureService';

export interface UseClosureInitiationReturn {
  isConfirmationModalOpen: boolean;
  setIsConfirmationModalOpen: (open: boolean) => void;
  closureState: ClosureState;
  initiateClosure: (achRelationshipId: string) => Promise<void>;
}

/**
 * Custom hook for managing account closure initiation process
 * Handles confirmation modal state and closure initiation
 */
export function useClosureInitiation(accountId: string): UseClosureInitiationReturn {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Initialize closure state with default steps
  const initialSteps: ClosureStep[] = accountClosureService.getInitialClosureSteps();
  
  const closureState: ClosureState = {
    steps: initialSteps,
    currentStep: 0,
    error,
    canCancel: true,
    isProcessing,
    isComplete: false
  };

  const initiateClosure = async (achRelationshipId: string): Promise<void> => {
    try {
      setIsProcessing(true);
      setError(undefined);
      
      // Call the backend to initiate closure
      const response = await fetch(`/api/account-closure/initiate/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ach_relationship_id: achRelationshipId,
          confirm_liquidation: true,
          confirm_irreversible: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || 'Failed to initiate account closure');
      }

      const result = await response.json();
      
      if (result.success) {
        // Redirect to the closure progress page
        window.location.href = '/protected';
      } else {
        throw new Error(result.error || 'Failed to initiate account closure');
      }
    } catch (err) {
      console.error('[useClosureInitiation] Error initiating closure:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate account closure');
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isConfirmationModalOpen,
    setIsConfirmationModalOpen,
    closureState,
    initiateClosure
  };
} 