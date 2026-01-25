"use client";

import React from "react";
import { PersonalizationFormData, InvestmentTimeline } from "@/lib/types/personalization";
import { initialPersonalizationData } from "@/utils/services/personalization-data";

// Import hooks
import { 
  usePersonalizationForm, 
  useStepNavigation, 
  useSliderState 
} from "./personalization/hooks";

// Import section components
import {
  NameInputSection,
  GoalsSelectorSection,
  RiskToleranceSection,
  TimelineSliderSection,
  ExperienceLevelSection,
  MonthlyGoalSliderSection,
  MarketInterestsSection,
} from "./personalization/sections";

// Import navigation components
import { NavigationController } from "./personalization/NavigationController";
import { ValidationBanner } from "./personalization/ValidationBanner";

interface PersonalizationStepProps {
  data: PersonalizationFormData;
  onUpdate: (data: Partial<PersonalizationFormData>) => void;
  onContinue: () => void;
  onBack?: () => void;
  onProgressUpdate?: (currentStep: number, totalSteps: number) => void;
  /** Override the display total steps (e.g., 8 when Terms step follows personalization) */
  displayTotalSteps?: number;
}

/**
 * Refactored PersonalizationStep component following SOLID principles
 * Shows ONE QUESTION AT A TIME for both mobile and desktop (unified experience)
 * 
 * ARCHITECTURE IMPROVEMENTS:
 * - ✅ Single Responsibility: Each section handles one specific concern
 * - ✅ Separation of Concerns: Hooks handle state, components handle UI
 * - ✅ Dependency Inversion: Abstractions through props and callbacks
 * - ✅ Open/Closed: Easy to extend with new sections without modification
 * - ✅ Testability: Each component can be tested in isolation
 * - ✅ Maintainability: Changes to one section don't affect others
 * - ✅ Professional UX: Step-by-step flow for focused, distraction-free experience
 */
export default function PersonalizationStep({ 
  data, 
  onUpdate, 
  onContinue, 
  onBack,
  onProgressUpdate,
  displayTotalSteps
}: PersonalizationStepProps) {
  const formRef = React.useRef<HTMLFormElement>(null);
  // Custom hooks for state management - used for validation only (data saves in Terms step)
  const {
    errors,
    clearError,
  } = usePersonalizationForm();

  const {
    tempTimelineIndex,
    tempMonthlyValue,
    handleTimelineChange,
    handleTimelineCommit,
    handleMonthlyGoalChange,
    handleMonthlyGoalCommit,
  } = useSliderState();

  // Update handlers with error clearing
  const handleUpdate = (updates: Partial<PersonalizationFormData>) => {
    onUpdate(updates);
  };

  const handleFirstNameChange = (firstName: string) => {
    handleUpdate({ firstName });
    if (firstName.length > 0) {
      clearError('firstName');
    }
  };

  const handleGoalsChange = (investmentGoals: PersonalizationFormData['investmentGoals']) => {
    handleUpdate({ investmentGoals });
    if (investmentGoals && investmentGoals.length > 0) {
      clearError('investmentGoals');
    }
  };

  const handleRiskChange = (riskTolerance: PersonalizationFormData['riskTolerance']) => {
    handleUpdate({ riskTolerance });
    clearError('riskTolerance');
  };

  const handleTimelineUpdate = (investmentTimeline: PersonalizationFormData['investmentTimeline']) => {
    handleUpdate({ investmentTimeline });
    clearError('investmentTimeline');
  };

  const handleExperienceChange = (experienceLevel: PersonalizationFormData['experienceLevel']) => {
    handleUpdate({ experienceLevel });
    clearError('experienceLevel');
  };

  const handleMonthlyGoalUpdate = (monthlyInvestmentGoal: number) => {
    handleUpdate({ monthlyInvestmentGoal });
    clearError('monthlyInvestmentGoal');
  };

  const handleInterestsChange = (marketInterests: PersonalizationFormData['marketInterests']) => {
    handleUpdate({ marketInterests });
    if (marketInterests && marketInterests.length > 0) {
      clearError('marketInterests');
    }
  };

  // Total steps for navigation - must be defined before useStepNavigation
  const TOTAL_STEPS = 7; // 7 personalization steps
  const DISPLAY_TOTAL = displayTotalSteps || TOTAL_STEPS;

  // Step navigation hook - must be called before sections array that uses currentStep/currentStepError
  const {
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
  } = useStepNavigation(TOTAL_STEPS);

  // Helper to get error for current step - uses step validation error if present, otherwise form error
  const getStepError = (stepIndex: number, formError?: string) => {
    if (currentStep === stepIndex && currentStepError) {
      return currentStepError;
    }
    return formError;
  };

  // Section components array for mobile navigation
  const sections = [
    <NameInputSection
      key="name"
      value={data.firstName || ''}
      onChange={handleFirstNameChange}
      error={getStepError(0, errors.firstName)}
      onClearError={() => { clearError('firstName'); clearCurrentStepError(); }}
    />,
    <GoalsSelectorSection
      key="goals"
      selectedGoals={data.investmentGoals || []}
      onChange={handleGoalsChange}
      error={getStepError(1, errors.investmentGoals)}
      onClearError={() => { clearError('investmentGoals'); clearCurrentStepError(); }}
    />,
    <RiskToleranceSection
      key="risk"
      selectedRisk={data.riskTolerance || ''}
      onChange={handleRiskChange}
      error={getStepError(2, errors.riskTolerance)}
      onClearError={() => { clearError('riskTolerance'); clearCurrentStepError(); }}
    />,
    <TimelineSliderSection
      key="timeline"
      selectedTimeline={data.investmentTimeline || ''}
      onChange={handleTimelineUpdate}
      tempIndex={tempTimelineIndex}
      onSliderChange={handleTimelineChange}
      onSliderCommit={(values) => handleTimelineCommit(values, (index) => {
        const timeline = [
          InvestmentTimeline.LESS_THAN_1_YEAR,
          InvestmentTimeline.ONE_TO_THREE_YEARS,
          InvestmentTimeline.THREE_TO_FIVE_YEARS,
          InvestmentTimeline.FIVE_TO_TEN_YEARS,
          InvestmentTimeline.TEN_PLUS_YEARS
        ][index];
        handleTimelineUpdate(timeline);
      })}
      error={getStepError(3, errors.investmentTimeline)}
      onClearError={() => { clearError('investmentTimeline'); clearCurrentStepError(); }}
    />,
    <ExperienceLevelSection
      key="experience"
      selectedLevel={data.experienceLevel || ''}
      onChange={handleExperienceChange}
      error={getStepError(4, errors.experienceLevel)}
      onClearError={() => { clearError('experienceLevel'); clearCurrentStepError(); }}
    />,
    <MonthlyGoalSliderSection
      key="monthly"
      selectedGoal={data.monthlyInvestmentGoal ?? initialPersonalizationData.monthlyInvestmentGoal!}
      onChange={handleMonthlyGoalUpdate}
      tempValue={tempMonthlyValue}
      onSliderChange={handleMonthlyGoalChange}
      onSliderCommit={(values) => handleMonthlyGoalCommit(values, (value) => {
        handleMonthlyGoalUpdate(value);
      })}
      error={getStepError(5, errors.monthlyInvestmentGoal)}
      onClearError={() => { clearError('monthlyInvestmentGoal'); clearCurrentStepError(); }}
    />,
    <MarketInterestsSection
      key="interests"
      selectedInterests={data.marketInterests || []}
      onChange={handleInterestsChange}
      error={getStepError(6, errors.marketInterests)}
      onClearError={() => { clearError('marketInterests'); clearCurrentStepError(); }}
    />,
  ];

  // Notify parent about progress updates
  React.useEffect(() => {
    onProgressUpdate?.(currentStep, DISPLAY_TOTAL);
  }, [currentStep, onProgressUpdate, DISPLAY_TOTAL]);

  // Handle next step with validation
  const handleNextStep = () => {
    tryGoToNextStep(data);
  };

  // Form submission handler (for final personalization step)
  // Note: Data is NOT saved here - it will be saved after Terms & Conditions (step 8)
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // IMPORTANT: Only call onContinue() if we're on the LAST personalization step
    // This prevents early form submission (e.g., pressing Enter on step 1) from
    // skipping remaining personalization steps
    const isLastStep = currentStep === TOTAL_STEPS - 1;
    
    // Validate current step
    const isCurrentStepValid = tryGoToNextStep(data);
    if (!isCurrentStepValid) {
      // Show validation error for current step
      if (Object.keys(errors).length > 0) {
        showValidationBanner(errors, TOTAL_STEPS);
      }
      return;
    }
    
    // Only proceed to next onboarding phase if on the last personalization step
    if (isLastStep) {
      // All personalization steps valid - move to Terms & Conditions
      // Data will be saved there after user accepts all agreements
      onContinue();
    }
    // If not on last step, tryGoToNextStep already advanced to next step
  };

  return (
    <div className="flex flex-col onboarding-container">
      <form ref={formRef} onSubmit={handleFormSubmit} className="flex flex-col flex-1 px-4 sm:px-8 py-3 sm:py-6">
        {/* Validation banner (both mobile and desktop) */}
        {validationBanner && (
          <ValidationBanner
            missingFields={validationBanner.missingKeys}
            onDismiss={clearValidationBanner}
          />
        )}

        {/* Content area - ONE SECTION AT A TIME (both mobile and desktop) */}
        <div className="flex-1 flex items-start justify-center py-2 sm:py-4 sm:items-center">
          <div className="w-full max-w-lg">
            {sections[currentStep]}
          </div>
        </div>

        {/* Navigation - UNIFIED (both mobile and desktop) - Always visible */}
        <div className="mt-auto pt-4 sm:pt-6">
          <NavigationController
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}           // Actual personalization steps (7) for navigation logic
            displayTotalSteps={DISPLAY_TOTAL}  // Display total (8 in aggregation mode) for "X of Y"
            onNext={handleNextStep}
            onPrevious={goToPreviousStep}
            onComplete={() => formRef.current?.requestSubmit()}
          />
        </div>
      </form>
    </div>
  );
}