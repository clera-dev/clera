"use client";

import { useState, useCallback } from "react";

export interface ClosureStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  error?: string;
}

export interface ClosureState {
  isProcessing: boolean;
  currentStep: number;
  steps: ClosureStep[];
  error: string | null;
  isComplete: boolean;
  canCancel: boolean;
  confirmationNumber?: string;
  completionTimestamp?: string;
  estimatedCompletion?: string;
}

const initialSteps: ClosureStep[] = [
  {
    id: 'check-readiness',
    title: 'Checking Account Readiness',
    description: 'Verifying account can be closed safely',
    status: 'pending'
  },
  {
    id: 'initiate-closure',
    title: 'Initiating Account Closure',
    description: 'Cancelling orders and liquidating positions',
    status: 'pending'
  },
  {
    id: 'settlement',
    title: 'Waiting for Settlement',
    description: 'Waiting for trades to settle (T+1 business day)',
    status: 'pending'
  },
  {
    id: 'withdraw-funds',
    title: 'Withdrawing Funds',
    description: 'Transferring funds to your bank account',
    status: 'pending'
  },
  {
    id: 'close-account',
    title: 'Closing Account',
    description: 'Permanently closing your account',
    status: 'pending'
  }
];

// Helper function to generate confirmation number
const generateConfirmationNumber = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `CLA-${timestamp}-${random}`.toUpperCase();
};

// Helper function to calculate business day completion
const calculateEstimatedCompletion = (): string => {
  const now = new Date();
  let businessDays = 0;
  let currentDate = new Date(now);
  
  while (businessDays < 5) { // 3-5 business days, using 5 for conservative estimate
    currentDate.setDate(currentDate.getDate() + 1);
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
      businessDays++;
    }
  }
  
  return currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const useAccountClosure = (accountId: string) => {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [closureState, setClosureState] = useState<ClosureState>({
    isProcessing: false,
    currentStep: 0,
    steps: [...initialSteps],
    error: null,
    isComplete: false,
    canCancel: true
  });

  const updateStepStatus = (stepId: string, status: 'pending' | 'in-progress' | 'completed' | 'failed', error?: string) => {
    setClosureState(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId 
          ? { ...step, status, ...(error && { error }) }
          : step
      )
    }));
  };

  const moveToNextStep = () => {
    setClosureState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, prev.steps.length - 1)
    }));
  };

  const initiateClosure = useCallback(async (achRelationshipId: string) => {
    try {
      // IMMEDIATE: Update user status to pending_closure in Supabase
      const confirmationNumber = generateConfirmationNumber();
      const statusResponse = await fetch('/api/account-closure/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'pending_closure',
          confirmationNumber: confirmationNumber
        })
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to update user status');
      }

      // Close modal immediately  
      setIsConfirmationModalOpen(false);
      
      // REDIRECT IMMEDIATELY to /protected which will show AccountClosurePending
      window.location.href = '/protected';
      
      // Start background processing (fire and forget)
      fetch(`/api/account-closure/initiate/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ach_relationship_id: achRelationshipId,
          confirm_liquidation: true,
          confirm_irreversible: true
        })
      }).catch(error => {
        console.error('Background closure process error:', error);
        // Don't update UI - user is already redirected
      });
      
    } catch (error) {
      setClosureState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initiate closure process',
        isProcessing: false,
        canCancel: true
      }));
    }
  }, [accountId]);

  return {
    isConfirmationModalOpen,
    setIsConfirmationModalOpen,
    closureState,
    initiateClosure
  };
}; 