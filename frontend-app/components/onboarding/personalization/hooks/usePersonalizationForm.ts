"use client";

import { useState, useCallback } from "react";
import { PersonalizationFormData } from "@/lib/types/personalization";
import { validatePersonalizationData } from "@/utils/services/personalization-data";
import { saveOrUpdatePersonalizationData } from "@/utils/api/personalization-client";

export interface UsePersonalizationFormReturn {
  errors: Record<string, string>;
  isSubmitting: boolean;
  submitError: string | null;
  validateForm: (data: PersonalizationFormData) => boolean;
  handleSubmit: (
    data: PersonalizationFormData,
    onSuccess: () => void
  ) => Promise<void>;
  clearError: (field: string) => void;
  clearSubmitError: () => void;
}

/**
 * Custom hook for managing personalization form validation and submission
 * Extracted from PersonalizationStep.tsx to follow Single Responsibility Principle
 */
export function usePersonalizationForm(): UsePersonalizationFormReturn {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateFormData = useCallback((data: PersonalizationFormData): boolean => {
    const validation = validatePersonalizationData(data);

    if (validation.fieldErrors && Object.keys(validation.fieldErrors).length > 0) {
      setErrors(validation.fieldErrors);
    } else {
      // Fallback to string-based mapping to maintain backward compatibility
      const mappedErrors: Record<string, string> = {};
      for (const err of validation.errors) {
        const lower = err.toLowerCase();
        if (lower.includes('first name')) {
          mappedErrors.firstName = err;
        } else if (lower.includes('monthly investment goal')) {
          mappedErrors.monthlyInvestmentGoal = err;
        } else if (lower.includes('investment goal')) {
          mappedErrors.investmentGoals = err;
        } else if (lower.includes('risk')) {
          mappedErrors.riskTolerance = err;
        } else if (lower.includes('timeline')) {
          mappedErrors.investmentTimeline = err;
        } else if (lower.includes('experience')) {
          mappedErrors.experienceLevel = err;
        } else if (lower.includes('interest')) {
          mappedErrors.marketInterests = err;
        }
      }
      setErrors(mappedErrors);
    }

    return validation.isValid;
  }, []);

  const handleSubmit = useCallback(async (
    data: PersonalizationFormData,
    onSuccess: () => void
  ): Promise<void> => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Validate form data
      if (!validateFormData(data)) {
        return;
      }

      // Submit to API
      await saveOrUpdatePersonalizationData(data);
      onSuccess();
    } catch (error) {
      console.error('Error saving personalization data:', error);
      setSubmitError(
        error instanceof Error 
          ? error.message 
          : 'Failed to save personalization data. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [validateFormData]);

  const clearError = useCallback((field: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    errors,
    isSubmitting,
    submitError,
    validateForm: validateFormData,
    handleSubmit,
    clearError,
    clearSubmitError,
  };
}
