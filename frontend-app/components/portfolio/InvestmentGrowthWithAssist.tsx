"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';
import WhatIfCalculator from './WhatIfCalculator';

interface InvestmentGrowthWithAssistProps {
  currentPortfolioValue: number;
  isLoading: boolean;
  disabled?: boolean;
}

const InvestmentGrowthWithAssist: React.FC<InvestmentGrowthWithAssistProps> = ({
  currentPortfolioValue,
  isLoading,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Extract growth context for dynamic prompts
  const portfolioSize = currentPortfolioValue > 50000 ? "substantial" 
    : currentPortfolioValue > 10000 ? "growing" 
    : currentPortfolioValue > 1000 ? "starting" 
    : "beginner";
  
  const valueContext = currentPortfolioValue > 0 
    ? `with my current portfolio value of $${currentPortfolioValue.toFixed(0)}`
    : "as I'm starting to build my investment portfolio";
  
  // Create contextual prompt with growth planning data
  const generatePrompt = useContextualPrompt(
    "I'm looking at the investment growth calculator {valueContext}. Can you briefly explain how compound growth works and give me 1-2 strategies to accelerate my wealth building?",
    "investment_growth_projection",
    {
      valueContext: valueContext,
      portfolioStage: portfolioSize
    }
  );

  const getContextualPrompt = () => {
    if (disabled) {
      return "I'm interested in learning about investment growth and compound returns. Can you explain how compound growth works and what young investors should know about setting realistic financial goals and timeframes?";
    }
    
    if (currentPortfolioValue === 0) {
      return "I'm looking at the investment growth calculator but haven't started investing yet. Can you explain how compound growth works and help me understand what to expect as I begin building wealth through investing?";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (disabled) return "Learn about growth";
    if (currentPortfolioValue === 0) return "Understanding compound growth";
    return "Optimize my growth strategy";
  };

  const getDescription = () => {
    if (disabled) return "Learn about compound growth and realistic investment expectations";
    if (currentPortfolioValue === 0) return "Understand how your investments can grow over time";
    return "Get strategies to accelerate your wealth building and understand growth projections";
  };

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
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
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