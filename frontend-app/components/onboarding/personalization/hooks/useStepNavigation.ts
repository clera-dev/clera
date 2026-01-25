"use client";

import { useState, useEffect, useCallback } from "react";
import { PersonalizationFormData } from "@/lib/types/personalization";

export interface UseStepNavigationReturn {
  isMobile: boolean;
  currentStep: number;
  currentStepError: string | null;
  validationBanner: { missingKeys: string[]; firstInvalidStep: number } | null;
  goToStep: (step: number) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  tryGoToNextStep: (data: PersonalizationFormData) => boolean;
  showValidationBanner: (
    errors: Record<string, string>,
    totalSteps: number
  ) => void;
  clearValidationBanner: () => void;
  clearCurrentStepError: () => void;
}

export const STEP_FIELD_MAPPING: Record<number, string[]> = {
  0: ['firstName'],
  1: ['investmentGoals'],
  2: ['riskTolerance'],
  3: ['investmentTimeline'],
  4: ['experienceLevel'],
  5: ['monthlyInvestmentGoal'],
  6: ['marketInterests'],
};

// Validation rules for each step
const STEP_VALIDATION_RULES: Record<number, (data: PersonalizationFormData) => string | null> = {
  0: (data) => {
    if (!data.firstName || data.firstName.trim().length === 0) {
      return "Please enter your first name";
    }
    if (data.firstName.trim().length < 2) {
      return "Name must be at least 2 characters";
    }
    return null;
  },
  1: (data) => {
    if (!data.investmentGoals || data.investmentGoals.length === 0) {
      return "Please select at least one investment goal";
    }
    return null;
  },
  2: (data) => {
    if (!data.riskTolerance) {
      return "Please select your risk tolerance level";
    }
    return null;
  },
  3: (data) => {
    if (!data.investmentTimeline) {
      return "Please select your investment timeline";
    }
    return null;
  },
  4: (data) => {
    if (!data.experienceLevel) {
      return "Please select your experience level";
    }
    return null;
  },
  5: (data) => {
    // Monthly investment goal has a default value, so just check it exists
    if (data.monthlyInvestmentGoal === undefined || data.monthlyInvestmentGoal === null) {
      return "Please set your monthly investment goal";
    }
    return null;
  },
  6: (data) => {
    if (!data.marketInterests || data.marketInterests.length === 0) {
      return "Please select at least one area of interest";
    }
    return null;
  },
};

/**
 * Custom hook for managing step navigation state in personalization flow
 * Handles step-by-step navigation for both mobile and desktop (unified experience)
 * NOW WITH STEP-BY-STEP VALIDATION - validates current step before allowing progression
 */
export function useStepNavigation(totalSteps: number): UseStepNavigationReturn {
  const [isMobile, setIsMobile] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentStepError, setCurrentStepError] = useState<string | null>(null);
  const [validationBanner, setValidationBanner] = useState<{
    missingKeys: string[];
    firstInvalidStep: number;
  } | null>(null);

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const goToStep = useCallback((step: number) => {
    const clampedStep = Math.max(0, Math.min(step, totalSteps - 1));
    setCurrentStep(clampedStep);
    setValidationBanner(null);
    setCurrentStepError(null);
  }, [totalSteps]);

  const goToNextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setValidationBanner(null);
      setCurrentStepError(null);
    }
  }, [currentStep, totalSteps]);

  // Validate current step and go to next if valid
  const tryGoToNextStep = useCallback((data: PersonalizationFormData): boolean => {
    const validator = STEP_VALIDATION_RULES[currentStep];
    if (validator) {
      const error = validator(data);
      if (error) {
        setCurrentStepError(error);
        return false;
      }
    }
    
    // Validation passed, proceed to next step
    setCurrentStepError(null);
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setValidationBanner(null);
    }
    return true;
  }, [currentStep, totalSteps]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setValidationBanner(null);
      setCurrentStepError(null);
    }
  }, [currentStep]);

  const showValidationBanner = useCallback((
    errors: Record<string, string>,
    totalSteps: number
  ) => {
    const missingKeys = Object.keys(errors);
    if (missingKeys.length === 0) return;

    // Find the first step with an error
    let firstInvalidStep = 0;
    for (let step = 0; step < totalSteps; step++) {
      const fieldsForStep = STEP_FIELD_MAPPING[step] || [];
      const hasErrorInStep = fieldsForStep.some(field => errors[field]);
      
      if (hasErrorInStep) {
        firstInvalidStep = step;
        break;
      }
    }

    setValidationBanner({ missingKeys, firstInvalidStep });

    // Auto-scroll with delay to prevent interference (on mobile)
    if (isMobile) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    }
  }, [isMobile]);

  const clearValidationBanner = useCallback(() => {
    setValidationBanner(null);
  }, []);

  const clearCurrentStepError = useCallback(() => {
    setCurrentStepError(null);
  }, []);

  return {
    isMobile,
    currentStep,
    currentStepError,
    validationBanner,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    tryGoToNextStep,
    showValidationBanner,
    clearValidationBanner,
    clearCurrentStepError,
  };
}
