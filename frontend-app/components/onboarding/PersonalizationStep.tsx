"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { PersonalizationFormData, InvestmentTimeline } from "@/lib/types/personalization";
import { initialPersonalizationData } from "@/utils/services/personalization-data";
import { cn } from "@/lib/utils";

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
  onProgressUpdate
}: PersonalizationStepProps) {
  const formRef = React.useRef<HTMLFormElement>(null);
  // Custom hooks for state management
  const {
    errors,
    isSubmitting,
    submitError,
    handleSubmit,
    clearError,
    clearSubmitError,
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
    clearSubmitError();
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

  // Section components array for mobile navigation
  const sections = [
    <NameInputSection
      key="name"
      value={data.firstName || ''}
      onChange={handleFirstNameChange}
      error={errors.firstName}
      onClearError={() => clearError('firstName')}
    />,
    <GoalsSelectorSection
      key="goals"
      selectedGoals={data.investmentGoals || []}
      onChange={handleGoalsChange}
      error={errors.investmentGoals}
      onClearError={() => clearError('investmentGoals')}
    />,
    <RiskToleranceSection
      key="risk"
      selectedRisk={data.riskTolerance || ''}
      onChange={handleRiskChange}
      error={errors.riskTolerance}
      onClearError={() => clearError('riskTolerance')}
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
      error={errors.investmentTimeline}
      onClearError={() => clearError('investmentTimeline')}
    />,
    <ExperienceLevelSection
      key="experience"
      selectedLevel={data.experienceLevel || ''}
      onChange={handleExperienceChange}
      error={errors.experienceLevel}
      onClearError={() => clearError('experienceLevel')}
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
      error={errors.monthlyInvestmentGoal}
      onClearError={() => clearError('monthlyInvestmentGoal')}
    />,
    <MarketInterestsSection
      key="interests"
      selectedInterests={data.marketInterests || []}
      onChange={handleInterestsChange}
      error={errors.marketInterests}
      onClearError={() => clearError('marketInterests')}
    />,
  ];

  const TOTAL_STEPS = sections.length;

  const {
    isMobile,
    currentStep,
    validationBanner,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    showValidationBanner,
    clearValidationBanner,
  } = useStepNavigation(TOTAL_STEPS);

  // Notify parent about progress updates
  React.useEffect(() => {
    onProgressUpdate?.(currentStep, TOTAL_STEPS);
  }, [currentStep, onProgressUpdate, TOTAL_STEPS]);

  // Form submission handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await handleSubmit(data, () => {
      onContinue();
    });

    // Show validation banner if there are errors
    if (Object.keys(errors).length > 0) {
      showValidationBanner(errors, TOTAL_STEPS);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-200px)]">
      <form ref={formRef} onSubmit={handleFormSubmit} className="flex flex-col flex-1 px-4 sm:px-8 py-4 sm:py-6">
        {/* Validation banner (both mobile and desktop) */}
        {validationBanner && (
          <ValidationBanner
            missingFields={validationBanner.missingKeys}
            onDismiss={clearValidationBanner}
          />
        )}

        {/* Content area - ONE SECTION AT A TIME (both mobile and desktop) */}
        <div className="flex-1 flex items-center justify-center py-4">
          <div className="w-full max-w-lg">
            {sections[currentStep]}
          </div>
        </div>

        {/* Navigation - UNIFIED (both mobile and desktop) - Always visible */}
        <div className="mt-auto pt-6">
          <NavigationController
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            onNext={goToNextStep}
            onPrevious={goToPreviousStep}
            onComplete={() => formRef.current?.requestSubmit()}
            isSubmitting={isSubmitting}
          />
        </div>

        {/* Error display */}
        {submitError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md mx-4 sm:mx-0">
            <p className="text-red-600 text-sm font-medium">Error: {submitError}</p>
          </div>
        )}
      </form>
    </div>
  );
}