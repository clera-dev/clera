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
      "I'm looking at my portfolio analytics with a risk score of {riskScore}/10 and diversification score of {divScore}/10. Can you explain what these scores mean, whether they're good for my situation, and what I can do to improve them?",
      {
        triggerText: "Explain these scores",
        description: "Get a simple explanation of your risk and diversification metrics",
        priority: 'high'
      }
    ),
    
    assetAllocation: createAssistConfig(
      "Asset allocation breakdown",
      "portfolio_allocation",
      "I'm looking at my asset allocation chart showing {stockPercentage}% stocks, {bondPercentage}% bonds, and {otherPercentage}% other investments. Can you explain if this allocation makes sense for my goals and suggest any improvements?",
      {
        triggerText: "Ask about allocation",
        description: "Understand if your investment mix is right for you",
        priority: 'medium'
      }
    ),
    
    holdings: createAssistConfig(
      "Portfolio holdings",
      "portfolio_holdings",
      "I'm reviewing my portfolio holdings. Can you analyze my current positions and let me know if there are any concerns or opportunities I should be aware of?",
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
      "I'm reading this news summary: '{summaryText}'. Can you break this down in simple terms and explain specifically how this news affects my investments?",
      {
        triggerText: "Simplify this",
        description: "Get a plain-English explanation of how this news affects you",
        priority: 'medium'
      }
    ),
    
    marketNews: createAssistConfig(
      "Market news",
      "market_news",
      "I'm looking at this market news: '{newsTitle}'. Can you explain what this means for the overall market and my portfolio specifically?",
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
      "I'm looking at these investment recommendations. Can you explain why these stocks are suggested and whether they align with my investment goals?",
      {
        triggerText: "Why these picks?",
        description: "Understand the reasoning behind these investment suggestions",
        priority: 'high'
      }
    ),
    
    stockAnalysis: createAssistConfig(
      "Stock analysis",
      "stock_analysis",
      "I'm researching {stockSymbol}. Can you provide a comprehensive analysis of this stock including its fundamentals, risks, and whether it would be a good fit for my portfolio?",
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
      "I'm looking at my account dashboard. Can you help me understand my account status and if there's anything I should be doing to optimize my setup?",
      {
        triggerText: "Explain my account",
        description: "Get guidance on your account setup and next steps",
        priority: 'medium'
      }
    ),
    
    bankConnection: createAssistConfig(
      "Bank connection",
      "bank_funding",
      "I'm looking at my bank connection and funding options. Can you explain the different ways to fund my account and which would be best for me?",
      {
        triggerText: "Funding options",
        description: "Learn about the best ways to fund your account",
        priority: 'low'
      }
    )
  }
};

export default withCleraAssist; 