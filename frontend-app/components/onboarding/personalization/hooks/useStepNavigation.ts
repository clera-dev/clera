"use client";

import { useState, useEffect, useCallback } from "react";
import { PersonalizationFormData } from "@/lib/types/personalization";

export interface UseStepNavigationReturn {
  isMobile: boolean;
  currentStep: number;
  validationBanner: { missingKeys: string[]; firstInvalidStep: number } | null;
  goToStep: (step: number) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  showValidationBanner: (
    errors: Record<string, string>,
    totalSteps: number
  ) => void;
  clearValidationBanner: () => void;
}

const STEP_FIELD_MAPPING: Record<number, string[]> = {
  0: ['firstName'],
  1: ['investmentGoals'],
  2: ['riskTolerance'],
  3: ['investmentTimeline'],
  4: ['experienceLevel'],
  5: ['monthlyInvestmentGoal'],
  6: ['marketInterests'],
};

/**
 * Custom hook for managing step navigation state in personalization flow
 * Handles step-by-step navigation for both mobile and desktop (unified experience)
 */
export function useStepNavigation(totalSteps: number): UseStepNavigationReturn {
  const [isMobile, setIsMobile] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
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
    setValidationBanner(null); // Clear validation when navigating
  }, [totalSteps]);

  const goToNextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setValidationBanner(null);
    }
  }, [currentStep, totalSteps]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setValidationBanner(null);
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

  return {
    isMobile,
    currentStep,
    validationBanner,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    showValidationBanner,
    clearValidationBanner,
  };
}
