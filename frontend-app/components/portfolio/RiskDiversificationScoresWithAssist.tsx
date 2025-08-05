"use client";

import React from 'react';
import RiskDiversificationScores from './RiskDiversificationScores';
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';

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

const RiskDiversificationScoresWithAssist: React.FC<RiskDiversificationScoresWithAssistProps> = ({
  accountId,
  initialData,
  isLoading = false,
  error = null,
  skeletonContent,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Extract scores for dynamic prompt generation
  const riskScore = initialData ? parseFloat(initialData.risk_score) : 0;
  const divScore = initialData ? parseFloat(initialData.diversification_score) : 0;
  
  // Create contextual prompt with risk/diversification data
  const generatePrompt = useContextualPrompt(
    "I'm looking at my portfolio analytics with a risk score of {riskScore}/10 and diversification score of {divScore}/10. Can you briefly explain what these scores mean and give me 1-2 specific actions to improve them?",
    "portfolio_analytics",
    {
      riskScore: riskScore.toFixed(1),
      divScore: divScore.toFixed(1)
    }
  );

  const getContextualPrompt = () => {
    if (!accountId || disabled) {
      return "I'm interested in learning about portfolio risk and diversification. Can you briefly explain what these metrics mean and how young investors should think about them?";
    }
    
    if (!initialData) {
      return "I'm looking at my portfolio analytics but don't have scores yet. Can you quickly explain what risk and diversification scores measure and what good targets are for young investors?";
    }
    
    return generatePrompt();
  };

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
      prompt={getContextualPrompt()}
      triggerText="Explain these scores"
      description="Get a simple explanation of your risk and diversification metrics"
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