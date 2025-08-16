"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { 
  InvestmentGoal, 
  INVESTMENT_GOAL_DESCRIPTIONS 
} from "@/lib/types/personalization";

interface GoalsSelectorSectionProps {
  selectedGoals: InvestmentGoal[];
  onChange: (goals: InvestmentGoal[]) => void;
  error?: string;
  onClearError?: () => void;
}

/**
 * Investment goals selector section for personalization form
 * Allows multiple selection of investment goals
 */
export function GoalsSelectorSection({ 
  selectedGoals, 
  onChange, 
  error, 
  onClearError 
}: GoalsSelectorSectionProps) {
  const handleGoalToggle = (goal: InvestmentGoal) => {
    const isSelected = selectedGoals.includes(goal);
    const newGoals = isSelected
      ? selectedGoals.filter(g => g !== goal)
      : [...selectedGoals, goal];
    
    // Clear error when user makes a selection
    if (onClearError && newGoals.length > 0) {
      onClearError();
    }
    
    onChange(newGoals);
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          What investing goals can I help you achieve?
        </h2>
        <p className="text-gray-600">
          Select all that apply - you can choose multiple goals
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(INVESTMENT_GOAL_DESCRIPTIONS).map(([key, description]) => {
          const goal = key as InvestmentGoal;
          const isSelected = selectedGoals.includes(goal);
          
          return (
            <Card
              key={goal}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary",
                error && !isSelected && "border-red-200"
              )}
              onClick={() => handleGoalToggle(goal)}
            >
              <CardContent className="p-4 text-center relative">
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="font-medium text-gray-900 mb-1">
                  {description}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
