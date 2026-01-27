"use client";

import React, { useMemo } from 'react';
import RiskDiversificationScores from './RiskDiversificationScores';
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';

interface PortfolioAnalyticsData {
  risk_score: string;
  diversification_score: string;
}

interface RiskDiversificationScoresWithAssistProps {
  accountId: string | null;
  initialData: PortfolioAnalyticsData | null;
  isLoading?: boolean;
  error?: string | null;
  skeletonContent?: React.ReactNode;
  disabled?: boolean;
}

// Pure functions for score interpretation - defined outside component for reusability
const getRiskInterpretation = (score: number): string => {
  if (score >= 8) return "very high risk";
  if (score >= 6) return "high risk";
  if (score >= 4) return "moderate risk";
  if (score >= 2) return "low risk";
  return "very low risk";
};

const getDiversificationInterpretation = (score: number): string => {
  if (score >= 8) return "well diversified";
  if (score >= 6) return "moderately diversified";
  if (score >= 4) return "somewhat concentrated";
  if (score >= 2) return "poorly diversified";
  return "highly concentrated";
};

const RiskDiversificationScoresWithAssist: React.FC<RiskDiversificationScoresWithAssistProps> = ({
  accountId,
  initialData,
  isLoading = false,
  error = null,
  skeletonContent,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Memoize prompt generation - only recalculates when data actually changes
  // This prevents unnecessary recalculations on hover/unhover state changes
  const contextualPrompt = useMemo(() => {
    if (!accountId || disabled) {
      return "Can you explain what risk and diversification scores actually measure? I want to understand how to use these metrics without obsessing over them.";
    }
    
    if (!initialData) {
      return "I don't see my analytics scores here. What do risk and diversification scores measure, and what's a reasonable range to aim for?";
    }
    
    // Extract and validate scores
    const riskScore = parseFloat(initialData.risk_score) || 0;
    const divScore = parseFloat(initialData.diversification_score) || 0;
    
    // Create a highly personalized prompt that asks Clera to explain WHY
    const riskInterpretation = getRiskInterpretation(riskScore);
    const divInterpretation = getDiversificationInterpretation(divScore);
    
    return `My Risk Score is ${riskScore.toFixed(1)}/10 (${riskInterpretation}) and Diversification Score is ${divScore.toFixed(1)}/10 (${divInterpretation}). Can you look at my actual holdings and explain why my scores are what they are? What specific changes could improve them?`;
  }, [accountId, disabled, initialData]);

  if (!isEnabled) {
    return (
      <div className="space-y-6">
        {skeletonContent}
      </div>
    );
  }

  return (
    <CleraAssistCard
      title="Portfolio Analytics"
      content="Risk and diversification scores"
      context="portfolio_analytics"
      prompt={contextualPrompt}
      triggerText="Explain my scores"
      description="Understand what's driving your risk and diversification metrics"
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "portfolio_analytics")}
      isLoading={isLoading}
      error={error}
      skeletonContent={skeletonContent}
      disabled={disabled}
    >
      <RiskDiversificationScores
        accountId={accountId}
        initialData={initialData}
      />
    </CleraAssistCard>
  );
};

export default RiskDiversificationScoresWithAssist; 