"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';
import LivePortfolioValue from './LivePortfolioValue';
import PortfolioHistoryChart from './PortfolioHistoryChart';

interface PortfolioHistoryData {
  timestamp: number[];
  equity: (number | null)[];
  profit_loss: (number | null)[];
  profit_loss_pct: (number | null)[];
  base_value: number | null;
  timeframe: string;
  base_value_asof?: string | null;
}

interface PortfolioSummaryWithAssistProps {
  accountId: string | null;
  portfolioHistory: PortfolioHistoryData | null;
  selectedTimeRange: string;
  setSelectedTimeRange: (range: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  allTimeReturnAmount?: number | null;
  allTimeReturnPercent?: number | null;
}

const PortfolioSummaryWithAssist: React.FC<PortfolioSummaryWithAssistProps> = ({
  accountId,
  portfolioHistory,
  selectedTimeRange,
  setSelectedTimeRange,
  isLoading,
  disabled = false,
  allTimeReturnAmount,
  allTimeReturnPercent
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Extract portfolio metrics for context
  const hasHistoryData = portfolioHistory && portfolioHistory.equity && portfolioHistory.equity.length > 0;
  const currentValue = hasHistoryData ? portfolioHistory.equity[portfolioHistory.equity.length - 1] : null;
  const hasPositiveReturn = hasHistoryData && portfolioHistory.profit_loss && 
    portfolioHistory.profit_loss.length > 0 &&
    portfolioHistory.profit_loss[portfolioHistory.profit_loss.length - 1] !== null &&
    portfolioHistory.profit_loss[portfolioHistory.profit_loss.length - 1]! > 0;
  
  // Create contextual prompt with portfolio performance data
  const generatePrompt = useContextualPrompt(
    "I'm looking at my portfolio summary showing {timeRange} performance. {performanceContext} Can you briefly explain what this means for my investment journey?",
    "portfolio_summary",
    {
      timeRange: selectedTimeRange,
      performanceContext: hasHistoryData 
        ? hasPositiveReturn 
          ? "My portfolio has gained value over this period."
          : "My portfolio has declined in value over this period."
        : "I'm viewing my portfolio tracking chart."
    }
  );

  const getContextualPrompt = () => {
    if (!accountId || disabled) {
      return "I'm interested in learning about portfolio tracking and performance. Can you briefly explain how to evaluate investment performance and what I should focus on?";
    }
    
    if (!hasHistoryData) {
      return "I'm looking at my portfolio summary but don't have much performance history yet. Can you quickly explain what to expect as I build my investment portfolio?";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (!accountId || disabled) return "Learn about tracking";
    if (!hasHistoryData) return "Understanding performance";
    return "Analyze my progress";
  };

  const getDescription = () => {
    if (!accountId || disabled) return "Learn how to track and evaluate investment performance";
    if (!hasHistoryData) return "Understand what to expect as your portfolio grows";
    return "Get insights on your investment performance and what it means for your financial goals";
  };

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="bg-card shadow-lg">
        <CardHeader className="py-3">
          <CardTitle className="text-base md:text-lg font-medium">Portfolio Summary</CardTitle>
        </CardHeader>
        <CardContent className="pb-0">
          {accountId && <LivePortfolioValue accountId={accountId} />}
          
          {!portfolioHistory && isLoading ? (
            <Skeleton className="h-80 w-full mt-6" />
          ) : portfolioHistory ? (
            <div className="mt-4">
              <PortfolioHistoryChart
                data={portfolioHistory}
                timeRange={selectedTimeRange}
                setTimeRange={setSelectedTimeRange}
                allTimeReturnAmount={allTimeReturnAmount}
                allTimeReturnPercent={allTimeReturnPercent}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-center p-4 mt-6">Could not load portfolio history.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Portfolio Summary"
      content="Portfolio value and performance tracking"
      context="portfolio_summary"
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "portfolio_summary")}
      disabled={disabled}
      className="bg-card shadow-lg"
    >
      <div className="pb-0">
        {accountId && <LivePortfolioValue accountId={accountId} />}
        
        {!portfolioHistory && isLoading ? (
          <Skeleton className="h-80 w-full mt-6" />
        ) : portfolioHistory ? (
          <div className="mt-4">
            <PortfolioHistoryChart
              data={portfolioHistory}
              timeRange={selectedTimeRange}
              setTimeRange={setSelectedTimeRange}
              allTimeReturnAmount={allTimeReturnAmount}
              allTimeReturnPercent={allTimeReturnPercent}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-center p-4 mt-6">Could not load portfolio history.</p>
        )}
      </div>
    </CleraAssistCard>
  );
};

export default PortfolioSummaryWithAssist; 