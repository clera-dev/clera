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
    "My portfolio analytics show risk {riskScore}/10 and diversification {divScore}/10. Clearly eplain what these mean and give 1–2 specific actions to improve each.",
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
      return "I don't have analytics scores yet. Briefly explain what risk and diversification scores measure and suggest good targets and habits to move toward them.";
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