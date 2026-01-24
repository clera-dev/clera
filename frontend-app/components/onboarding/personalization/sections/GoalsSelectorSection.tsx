"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check, Info } from "lucide-react";
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
  const maxSelections = 5;

  const handleGoalToggle = (goal: InvestmentGoal) => {
    const isSelected = selectedGoals.includes(goal);
    let newGoals: InvestmentGoal[];

    if (isSelected) {
      newGoals = selectedGoals.filter(g => g !== goal);
    } else {
      if (selectedGoals.length >= maxSelections) {
        return;
      }
      newGoals = [...selectedGoals, goal];
    }
    
    // Clear error when user makes a selection
    if (onClearError && newGoals.length > 0) {
      onClearError();
    }
    
    onChange(newGoals);
  };

  const canSelectMore = selectedGoals.length < maxSelections;

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <div className="text-center px-4 sm:px-0">
        <h2 className="text-2xl font-semibold text-white mb-3">
          What are you investing for?
        </h2>
        <p className="text-gray-300 text-base mb-4">
          Select up to {maxSelections} goals ({selectedGoals.length}/{maxSelections} selected)
        </p>
        
        {/* Why we ask context box */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm text-gray-300">
          <Info className="h-4 w-4 text-primary" />
          <span>This will help me recommend the right investment strategies for you</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 sm:px-0">
        {Object.entries(INVESTMENT_GOAL_DESCRIPTIONS).map(([key, description]) => {
          const goal = key as InvestmentGoal;
          const isSelected = selectedGoals.includes(goal);
          const canClick = isSelected || canSelectMore;
          
          return (
            <Card
              key={goal}
              className={cn(
                "transition-all duration-200 bg-black border-gray-600",
                canClick && "cursor-pointer hover:shadow-md",
                !canClick && "opacity-50 cursor-not-allowed",
                isSelected && "ring-2 ring-primary border-primary bg-black",
                error && !isSelected && "border-red-400"
              )}
              onClick={canClick ? () => handleGoalToggle(goal) : undefined}
            >
              <CardContent className="p-4 text-center relative flex items-center justify-center min-h-[88px]">
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="font-bold text-white">
                  {description}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="text-center px-4 sm:px-0">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
