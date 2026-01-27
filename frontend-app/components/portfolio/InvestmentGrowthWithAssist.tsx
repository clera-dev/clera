"use client";

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
import WhatIfCalculator from './WhatIfCalculator';

interface InvestmentGrowthWithAssistProps {
  currentPortfolioValue: number;
  isLoading: boolean;
  disabled?: boolean;
}

// Pure utility functions defined outside component
const formatCurrencyCompact = (value: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

// Calculate years to reach a target value (pure function)
const calculateYearsToTarget = (
  currentValue: number,
  target: number, 
  annualReturn: number = 0.08, 
  monthlyContribution: number = 500
): number => {
  if (currentValue >= target) return 0;
  const monthlyRate = annualReturn / 12;
  let balance = currentValue;
  let months = 0;
  while (balance < target && months < 600) { // Cap at 50 years
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    months++;
  }
  return Math.round(months / 12);
};

// Determine portfolio stage (pure function)
const getPortfolioStage = (value: number): { stage: string; nextMilestone: number; focus: string } => {
  if (value < 1000) {
    return { stage: "Starting Out", nextMilestone: 1000, focus: "building the habit of regular investing" };
  } else if (value < 10000) {
    return { stage: "Building Foundation", nextMilestone: 10000, focus: "consistency and avoiding fees" };
  } else if (value < 50000) {
    return { stage: "Growth Phase", nextMilestone: 50000, focus: "diversification and staying the course" };
  } else if (value < 100000) {
    return { stage: "Accelerating", nextMilestone: 100000, focus: "optimization and tax efficiency" };
  } else {
    return { stage: "Wealth Building", nextMilestone: value * 2, focus: "asset allocation and risk management" };
  }
};

const InvestmentGrowthWithAssist: React.FC<InvestmentGrowthWithAssistProps> = ({
  currentPortfolioValue,
  isLoading,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Memoize all calculations and prompt generation
  const { contextualPrompt, triggerText, description } = useMemo(() => {
    if (disabled) {
      return {
        contextualPrompt: "Can you explain how compound growth works? I'd like to understand realistic expectations for investment growth over time.",
        triggerText: "Learn growth",
        description: "Understand how compound growth works over time"
      };
    }
    
    if (currentPortfolioValue === 0) {
      return {
        contextualPrompt: "I'm looking to start investing. Can you give me a quick overview of compound growth and a practical approach to get started?",
        triggerText: "Learn compounding",
        description: "Understand how investments can grow over time"
      };
    }
    
    const { nextMilestone, focus } = getPortfolioStage(currentPortfolioValue);
    
    // Build conversational prompt - focus on the numbers, not labels
    let prompt = `My portfolio is currently ${formatCurrencyCompact(currentPortfolioValue)}. `;
    prompt += `I'm working toward ${formatCurrencyCompact(nextMilestone)}.\n\n`;
    prompt += `What's the most impactful thing I can focus on right now to keep growing? Any strategies that make sense at this portfolio size?`;
    
    return {
      contextualPrompt: prompt,
      triggerText: "Optimize growth",
      description: "Get strategies tailored to your current portfolio stage"
    };
  }, [currentPortfolioValue, disabled]);

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="bg-card shadow-lg">
        <CardHeader className="py-3">
          <CardTitle className="text-base md:text-lg">Investment Growth Projection</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <WhatIfCalculator currentPortfolioValue={currentPortfolioValue} />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Investment Growth Projection"
      content="Future value and compound growth calculator"
      context="investment_growth_projection"
      prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "investment_growth_projection")}
      disabled={disabled}
      className="bg-card shadow-lg"
    >
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <WhatIfCalculator currentPortfolioValue={currentPortfolioValue} />
      )}
    </CleraAssistCard>
  );
};

export default InvestmentGrowthWithAssist; 