"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';
import LivePortfolioValue from './LivePortfolioValue';
import StaticPortfolioValue from './StaticPortfolioValue';
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
  portfolioMode?: string;
  onReturnRefresh?: () => void;
  refreshTimestamp?: number;
  userId?: string;
  hasHistoricalData?: boolean;
  selectedAccountFilter?: 'total' | string;
  onAccountFilterChange?: (accountId: 'total' | string) => void;
  availableAccounts?: any[];
}

const PortfolioSummaryWithAssist: React.FC<PortfolioSummaryWithAssistProps> = ({
  accountId,
  portfolioHistory,
  selectedTimeRange,
  setSelectedTimeRange,
  isLoading,
  disabled = false,
  allTimeReturnAmount,
  allTimeReturnPercent,
  portfolioMode = 'brokerage',
  onReturnRefresh,
  refreshTimestamp,
  userId,
  hasHistoricalData = false,
  selectedAccountFilter = 'total',
  onAccountFilterChange,
  availableAccounts = []
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
    "Please review my portfolio summary for the {timeRange} period. {performanceSentence} Give me a short interpretation and 1–2 practical next steps.",
    "portfolio_summary",
    {
      timeRange: selectedTimeRange,
      performanceSentence: (() => {
        if (!hasHistoryData || !portfolioHistory) return "I don't have enough history yet.";
        const plPctArray = portfolioHistory.profit_loss_pct || [];
        const lastPlPct = plPctArray.length ? plPctArray[plPctArray.length - 1] : null;
        if (typeof lastPlPct === 'number') {
          const pct = (lastPlPct * 100).toFixed(1);
          return Number(pct) >= 0 ? `Change: +${pct}%.` : `Change: ${pct}%.`;
        }
        return hasPositiveReturn ? "The portfolio is up." : "The portfolio is down.";
      })()
    }
  );

  const getContextualPrompt = () => {
    if (!accountId || disabled) {
      return "I'm interested in learning about portfolio tracking and performance. Can you briefly explain how to evaluate investment performance and what I should focus on?";
    }
    
    if (!hasHistoryData) {
      return "I don't have much performance history yet. Give me a brief overview of what to monitor and how to judge progress fairly over time.";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (!accountId || disabled) return "Analyze my progress";
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
          {/* For aggregation mode: accountId can be null, that's OK */}
          {(accountId || portfolioMode === 'aggregation') && (
            portfolioMode === 'aggregation' ? (
              // Aggregation mode: Always show LivePortfolioValue
              <LivePortfolioValue 
                accountId={accountId || 'aggregated'}
                portfolioMode={portfolioMode}
              />
            ) : (
              // Brokerage mode: Requires valid accountId
              <LivePortfolioValue 
                accountId={accountId!} 
                portfolioMode={portfolioMode}
              />
            )
          )}
          
          {!portfolioHistory && isLoading ? (
            <Skeleton className="h-80 w-full mt-6" />
          ) : portfolioHistory ? (
            <div className="mt-4">
              <PortfolioHistoryChart
                key={`chart-${selectedAccountFilter || 'total'}-${selectedTimeRange}`}
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
      title="Portfolio Value"
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
        {(accountId || (portfolioMode === 'aggregation' && userId)) && (
          portfolioMode === 'aggregation' ? (
            // Aggregation mode: Always show if userId exists
            userId ? (
              <LivePortfolioValue 
                accountId={accountId || 'aggregated'}
                portfolioMode={portfolioMode}
              />
            ) : null
          ) : accountId ? (
            // Brokerage mode: Requires accountId
            <LivePortfolioValue 
              accountId={accountId} 
              portfolioMode={portfolioMode}
            />
          ) : null
        )}
        
        {!portfolioHistory && isLoading ? (
          <Skeleton className="h-80 w-full mt-6" />
        ) : portfolioHistory ? (
          <div className="mt-4">
            <PortfolioHistoryChart
              key={`chart-${selectedAccountFilter || 'total'}-${selectedTimeRange}`}
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