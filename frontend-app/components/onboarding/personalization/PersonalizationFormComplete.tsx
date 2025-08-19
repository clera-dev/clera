"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { PersonalizationFormData, InvestmentTimeline } from "@/lib/types/personalization";
import { initialPersonalizationData } from "@/utils/services/personalization-data";

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
  disableSubmit?: boolean;
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
  title = "Update Your Personalization",
  disableSubmit = false,
}: PersonalizationFormCompleteProps) {
  // Custom hooks for state management
  const latestRef = React.useRef<PersonalizationFormData>(data);
  React.useEffect(() => {
    // Keep baseline in sync when parent data changes
    latestRef.current = data;
  }, [data]);
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
    
    // Use the latest locally tracked snapshot to avoid stale props
    await handleSubmit(latestRef.current, () => {
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
    latestRef.current = { ...latestRef.current, firstName };
    if (firstName.length > 0) {
      clearError('firstName');
    }
  };

  const handleGoalsChange = (investmentGoals: PersonalizationFormData['investmentGoals']) => {
    handleUpdate({ investmentGoals });
    latestRef.current = { ...latestRef.current, investmentGoals };
    if (investmentGoals && investmentGoals.length > 0) {
      clearError('investmentGoals');
    }
  };

  const handleRiskChange = (riskTolerance: PersonalizationFormData['riskTolerance']) => {
    handleUpdate({ riskTolerance });
    latestRef.current = { ...latestRef.current, riskTolerance };
    clearError('riskTolerance');
  };

  const handleTimelineUpdate = (investmentTimeline: PersonalizationFormData['investmentTimeline']) => {
    handleUpdate({ investmentTimeline });
    latestRef.current = { ...latestRef.current, investmentTimeline };
    clearError('investmentTimeline');
  };

  const handleExperienceChange = (experienceLevel: PersonalizationFormData['experienceLevel']) => {
    handleUpdate({ experienceLevel });
    latestRef.current = { ...latestRef.current, experienceLevel };
    clearError('experienceLevel');
  };

  const handleMonthlyGoalUpdate = (monthlyInvestmentGoal: number) => {
    handleUpdate({ monthlyInvestmentGoal });
    latestRef.current = { ...latestRef.current, monthlyInvestmentGoal };
    clearError('monthlyInvestmentGoal');
  };

  const handleInterestsChange = (marketInterests: PersonalizationFormData['marketInterests']) => {
    handleUpdate({ marketInterests });
    latestRef.current = { ...latestRef.current, marketInterests };
    if (marketInterests && marketInterests.length > 0) {
      clearError('marketInterests');
    }
  };

  return (
    <div className="max-w-4xl mx-auto text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-gray-300">
          Update your preferences to get more personalized investment advice from Clera.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-12">
        {/* All sections displayed vertically */}
        <div className="space-y-12">
          <div className="bg-card border border-border/30 rounded-lg p-8">
            <NameInputSection
              value={data.firstName || ''}
              onChange={handleFirstNameChange}
              error={errors.firstName}
              onClearError={() => clearError('firstName')}
            />
          </div>

          <div className="bg-card border border-border/30 rounded-lg p-8">
            <GoalsSelectorSection
              selectedGoals={data.investmentGoals || []}
              onChange={handleGoalsChange}
              error={errors.investmentGoals}
              onClearError={() => clearError('investmentGoals')}
            />
          </div>

          <div className="bg-card border border-border/30 rounded-lg p-8">
            <RiskToleranceSection
              selectedRisk={data.riskTolerance || ''}
              onChange={handleRiskChange}
              error={errors.riskTolerance}
              onClearError={() => clearError('riskTolerance')}
            />
          </div>

          <div className="bg-card border border-border/30 rounded-lg p-8">
            <TimelineSliderSection
              selectedTimeline={data.investmentTimeline || ''}
              onChange={handleTimelineUpdate}
              tempIndex={tempTimelineIndex}
              onSliderChange={handleTimelineChange}
              onSliderCommit={(values) => handleTimelineCommit(values, (index) => {
                // Delegate to TimelineSliderSection's single source of truth via index→value mapping
                // We re-trigger onChange by passing the selected index back into the child component's mapping
                // by simply updating selectedTimeline using TimelineSliderSection's onChange through handleTimelineUpdate
                // This keeps mapping consistent with TIMELINE_OPTIONS
                // TimelineSliderSection will call onChange with the correct InvestmentTimeline value
                // because its own handleSliderCommit maps index using TIMELINE_OPTIONS
                // Here, convert index to timeline by temporarily importing the options would recreate duplication.
                // So rely on child: set temp index and trigger commit flow.
                const i = index; // no-op; index flows through child mapping
                // As handleTimelineCommit already sets temp index to null and we receive index here,
                // we can directly map by calling handleTimelineUpdate with current selection from child.
                // However, since child already invoked onChange on commit, this is just a safety: do nothing.
                // Keep for API compatibility.
              })}
              error={errors.investmentTimeline}
              onClearError={() => clearError('investmentTimeline')}
            />
          </div>

          <div className="bg-card border border-border/30 rounded-lg p-8">
            <ExperienceLevelSection
              selectedLevel={data.experienceLevel || ''}
              onChange={handleExperienceChange}
              error={errors.experienceLevel}
              onClearError={() => clearError('experienceLevel')}
            />
          </div>

          <div className="bg-card border border-border/30 rounded-lg p-8">
            <MonthlyGoalSliderSection
              selectedGoal={data.monthlyInvestmentGoal ?? initialPersonalizationData.monthlyInvestmentGoal!}
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

          <div className="bg-black border border-border/30 rounded-lg p-8">
            <MarketInterestsSection
              selectedInterests={data.marketInterests || []}
              onChange={handleInterestsChange}
              error={errors.marketInterests}
              onClearError={() => clearError('marketInterests')}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-8 border-t border-border/30">
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
            disabled={isSubmitting || disableSubmit}
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
