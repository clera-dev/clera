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
    id: 'cancel-orders',
    title: 'Cancelling Open Orders',
    description: 'Cancelling all pending orders',
    status: 'pending'
  },
  {
    id: 'liquidate-positions',
    title: 'Liquidating Positions',
    description: 'Selling all holdings at market price',
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
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isFinalModalOpen, setIsFinalModalOpen] = useState(false);
  const [showSuccessPage, setShowSuccessPage] = useState(false);
  
  const [closureState, setClosureState] = useState<ClosureState>({
    isProcessing: false,
    currentStep: 0,
    steps: [...initialSteps],
    error: null,
    isComplete: false,
    canCancel: true
  });

  const updateStepStatus = useCallback((stepId: string, status: ClosureStep['status'], error?: string) => {
    setClosureState(prev => ({
      ...prev,
      steps: prev.steps.map(step => 
        step.id === stepId 
          ? { ...step, status, error }
          : step
      )
    }));
  }, []);

  const moveToNextStep = useCallback(() => {
    setClosureState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, prev.steps.length - 1)
    }));
  }, []);

  const checkAccountReadiness = async () => {
    try {
      updateStepStatus('check-readiness', 'in-progress');
      
      const response = await fetch(`/api/account-closure/check-readiness/${accountId}`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to check account readiness');
      }
      
      if (!result.ready) {
        throw new Error(result.reason || 'Account is not ready for closure');
      }
      
      updateStepStatus('check-readiness', 'completed');
      moveToNextStep();
      return true;
    } catch (error) {
      updateStepStatus('check-readiness', 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };

  const executeClosureStep = async (stepId: string, endpoint: string) => {
    try {
      updateStepStatus(stepId, 'in-progress');
      
      const response = await fetch(`/api/account-closure/${endpoint}/${accountId}`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || `Failed to execute ${stepId}`);
      }
      
      updateStepStatus(stepId, 'completed');
      moveToNextStep();
      return result;
    } catch (error) {
      updateStepStatus(stepId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  };

  const initiateClosure = useCallback(async () => {
    setClosureState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
      currentStep: 0,
      steps: prev.steps.map(step => ({ ...step, status: 'pending', error: undefined }))
    }));

    try {
      // Step 1: Check readiness
      await checkAccountReadiness();
      
      // Step 2: Cancel orders
      await executeClosureStep('cancel-orders', 'cancel-orders');
      
      // Step 3: Liquidate positions
      await executeClosureStep('liquidate-positions', 'liquidate-positions');
      
      // After liquidation, we need to wait for settlement and user final confirmation
      setClosureState(prev => ({ 
        ...prev, 
        canCancel: true, // User can still cancel before final step
        isProcessing: false 
      }));
      
    } catch (error) {
      setClosureState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        isProcessing: false,
        canCancel: true
      }));
    }
  }, [accountId]);

  const finalConfirmClosure = useCallback(async () => {
    setClosureState(prev => ({
      ...prev,
      isProcessing: true,
      canCancel: false
    }));

    try {
      // Step 4: Wait for settlement
      await executeClosureStep('settlement', 'check-settlement');
      
      // Step 5: Withdraw funds
      await executeClosureStep('withdraw-funds', 'withdraw-funds');
      
      // Step 6: Close account
      await executeClosureStep('close-account', 'close-account');
      
      const confirmationNumber = generateConfirmationNumber();
      const completionTimestamp = new Date().toISOString();
      const estimatedCompletion = calculateEstimatedCompletion();
      
      setClosureState(prev => ({
        ...prev,
        isComplete: true,
        isProcessing: false,
        confirmationNumber,
        completionTimestamp,
        estimatedCompletion
      }));
      
      // Close modals and show success page
      setIsProcessModalOpen(false);
      setIsFinalModalOpen(false);
      setShowSuccessPage(true);
      
    } catch (error) {
      setClosureState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        isProcessing: false,
        canCancel: false // Once we start final steps, we can't cancel
      }));
    }
  }, [accountId]);

  const cancelClosure = useCallback(() => {
    setClosureState({
      isProcessing: false,
      currentStep: 0,
      steps: [...initialSteps],
      error: null,
      isComplete: false,
      canCancel: true
    });
    
    setIsConfirmationModalOpen(false);
    setIsProcessModalOpen(false);
    setIsFinalModalOpen(false);
    setShowSuccessPage(false);
  }, []);

  const navigateHome = useCallback(() => {
    setShowSuccessPage(false);
    // Reset closure state
    setClosureState({
      isProcessing: false,
      currentStep: 0,
      steps: [...initialSteps],
      error: null,
      isComplete: false,
      canCancel: true
    });
  }, []);

  return {
    isConfirmationModalOpen,
    setIsConfirmationModalOpen,
    isProcessModalOpen,
    setIsProcessModalOpen,
    isFinalModalOpen,
    setIsFinalModalOpen,
    showSuccessPage,
    setShowSuccessPage,
    closureState,
    initiateClosure,
    finalConfirmClosure,
    cancelClosure,
    navigateHome
  };
}; 