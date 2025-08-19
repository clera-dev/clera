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

    // Use structured field errors from validation service to avoid brittle string parsing
    setErrors(validation.fieldErrors || {});

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
      const result = await saveOrUpdatePersonalizationData(data);
      
      if (!result.success) {
        setSubmitError(result.error || 'Failed to save personalization data. Please try again.');
        return;
      }
      
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
