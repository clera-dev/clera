"use client";

import { Button } from "@/components/ui/button";
import { PersonalizationFormData, InvestmentTimeline } from "@/lib/types/personalization";

// Import hooks
import { 
  usePersonalizationForm, 
  useSliderState 
} from "./hooks";

// Import section components
import {
  NameInputSection,
  GoalsSelectorSection,
  RiskToleranceSection,
  TimelineSliderSection,
  ExperienceLevelSection,
  MonthlyGoalSliderSection,
  MarketInterestsSection,
} from "./sections";

interface PersonalizationFormCompleteProps {
  data: PersonalizationFormData;
  onUpdate: (data: Partial<PersonalizationFormData>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitButtonText?: string;
  title?: string;
}

/**
 * Complete personalization form component for dashboard editing
 * Shows all sections on a single scrollable page for easy editing
 * 
 * Used in: /dashboard/account/update-personalization
 * Different from onboarding which shows one step at a time
 */
export function PersonalizationFormComplete({ 
  data, 
  onUpdate, 
  onSubmit,
  onCancel,
  submitButtonText = "Save Changes",
  title = "Update Your Personalization"
}: PersonalizationFormCompleteProps) {
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

  // Form submission handler
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await handleSubmit(data, () => {
      onSubmit();
    });
  };

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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600">
          Update your preferences to get more personalized investment advice from Clera.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-12">
        {/* All sections displayed vertically */}
        <div className="space-y-12">
          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <NameInputSection
              value={data.firstName || ''}
              onChange={handleFirstNameChange}
              error={errors.firstName}
              onClearError={() => clearError('firstName')}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <GoalsSelectorSection
              selectedGoals={data.investmentGoals || []}
              onChange={handleGoalsChange}
              error={errors.investmentGoals}
              onClearError={() => clearError('investmentGoals')}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <RiskToleranceSection
              selectedRisk={data.riskTolerance || ''}
              onChange={handleRiskChange}
              error={errors.riskTolerance}
              onClearError={() => clearError('riskTolerance')}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <TimelineSliderSection
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
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <ExperienceLevelSection
              selectedLevel={data.experienceLevel || ''}
              onChange={handleExperienceChange}
              error={errors.experienceLevel}
              onClearError={() => clearError('experienceLevel')}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <MonthlyGoalSliderSection
              selectedGoal={data.monthlyInvestmentGoal || 1}
              onChange={handleMonthlyGoalUpdate}
              tempValue={tempMonthlyValue}
              onSliderChange={handleMonthlyGoalChange}
              onSliderCommit={(values) => handleMonthlyGoalCommit(values, (value) => {
                handleMonthlyGoalUpdate(value);
              })}
              error={errors.monthlyInvestmentGoal}
              onClearError={() => clearError('monthlyInvestmentGoal')}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <MarketInterestsSection
              selectedInterests={data.marketInterests || []}
              onChange={handleInterestsChange}
              error={errors.marketInterests}
              onClearError={() => clearError('marketInterests')}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-8 border-t border-gray-200">
          {onCancel && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-gradient-to-r from-primary to-blue-600 hover:shadow-lg ml-auto"
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </Button>
        </div>

        {/* Error display */}
        {submitError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm font-medium">Error: {submitError}</p>
          </div>
        )}
      </form>
    </div>
  );
}
