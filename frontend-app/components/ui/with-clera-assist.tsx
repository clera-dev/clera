"use client";

import React from 'react';
import CleraAssist, { CleraAssistProps } from './clera-assist';
import { useCleraAssist } from './clera-assist-provider';

type CleraAssistConfig = Omit<CleraAssistProps, 'children' | 'onAssistClick'>;

// Higher-order component for wrapping existing components
export const withCleraAssist = <P extends object>(
  Component: React.ComponentType<P>,
  assistConfig: CleraAssistConfig
) => {
  const WrappedComponent: React.FC<P> = (props) => {
    const { openChatWithPrompt, isEnabled } = useCleraAssist();

    if (!isEnabled) {
      return <Component {...props} />;
    }

    return (
      <CleraAssist
        {...assistConfig}
        onAssistClick={(prompt) => openChatWithPrompt(prompt, assistConfig.context)}
      >
        <Component {...props} />
      </CleraAssist>
    );
  };

  WrappedComponent.displayName = `withCleraAssist(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

// Utility function to create assist configurations
export const createAssistConfig = (
  content: string,
  context: string,
  prompt: string,
  options: Partial<CleraAssistConfig> = {}
): CleraAssistConfig => ({
  content,
  context,
  prompt,
  triggerText: options.triggerText || "Ask Clera",
  description: options.description || `Get help understanding ${content.toLowerCase()}`,
  trigger: options.trigger || 'hover',
  placement: options.placement || 'corner',
  priority: options.priority || 'medium',
  showCondition: options.showCondition,
});

// Pre-defined assist configurations for common use cases
export const assistConfigs = {
  portfolio: {
    riskScores: createAssistConfig(
      "Risk and diversification scores",
      "portfolio_analytics",
      "My analytics show risk {riskScore}/10 and diversification {divScore}/10. Explain what these mean and give 1–2 specific improvements for each.",
      {
        triggerText: "Explain these scores",
        description: "Get a simple explanation of your risk and diversification metrics",
        priority: 'high'
      }
    ),
    
    assetAllocation: createAssistConfig(
      "Asset allocation breakdown",
      "portfolio_allocation",
      "Assess my mix: {stockPercentage}% stocks, {bondPercentage}% bonds, {otherPercentage}% other. Is this sensible long term? Recommend 1–2 concrete tweaks.",
      {
        triggerText: "Ask about allocation",
        description: "Understand if your investment mix is right for you",
        priority: 'medium'
      }
    ),
    
    holdings: createAssistConfig(
      "Portfolio holdings",
      "portfolio_holdings",
      "Evaluate my current positions. Point out any concentration risks or weak links and suggest 1–2 actions (e.g., trim/add/rebalance).",
      {
        triggerText: "Analyze holdings",
        description: "Get insights about your current investments",
        priority: 'medium'
      }
    )
  },
  
  news: {
    summary: createAssistConfig(
      "News summary",
      "news_summary",
      "Summarize in plain English how this news affects a diversified long-term portfolio and flag 1–2 actionable watch items: '{summaryText}'.",
      {
        triggerText: "Simplify this",
        description: "Get a plain-English explanation of how this news affects you",
        priority: 'medium'
      }
    ),
    
    marketNews: createAssistConfig(
      "Market news",
      "market_news",
      "Explain the market implications and practical portfolio takeaways for: '{newsTitle}'.",
      {
        triggerText: "Explain impact",
        description: "Understand how this news affects your investments",
        priority: 'low'
      }
    )
  },
  
  invest: {
    recommendations: createAssistConfig(
      "Investment recommendations",
      "investment_recommendations",
      "Explain the rationale behind these recommendations and whether they fit a long-term, diversified plan. Call out risks and required conviction.",
      {
        triggerText: "Why these picks?",
        description: "Understand the reasoning behind these investment suggestions",
        priority: 'high'
      }
    ),
    
    stockAnalysis: createAssistConfig(
      "Stock analysis",
      "stock_analysis",
      "Analyze {stockSymbol}: key fundamentals, moat, risks, and whether it suits a diversified long-term portfolio.",
      {
        triggerText: "Analyze this stock",
        description: "Get detailed insights about this investment opportunity",
        priority: 'medium'
      }
    )
  },
  
  dashboard: {
    accountInfo: createAssistConfig(
      "Account information",
      "account_dashboard",
      "Review my account status and suggest 1–2 next steps to optimize setup and readiness (e.g., funding, diversification, alerts).",
      {
        triggerText: "Explain my account",
        description: "Get guidance on your account setup and next steps",
        priority: 'medium'
      }
    ),
    
    bankConnection: createAssistConfig(
      "Bank connection",
      "bank_funding",
      "Recommend a simple, safe funding approach and timing given typical cash flow and investing cadence.",
      {
        triggerText: "Funding options",
        description: "Learn about the best ways to fund your account",
        priority: 'low'
      }
    )
  }
};

export default withCleraAssist; 