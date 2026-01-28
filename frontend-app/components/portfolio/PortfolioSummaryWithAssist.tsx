"use client";

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
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

// Pure utility functions defined outside component for efficiency
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const TIME_RANGE_LABELS: Record<string, string> = {
  '1D': 'today',
  '1W': 'this week',
  '1M': 'this month',
  '3M': 'the past 3 months',
  '1Y': 'the past year',
  'ALL': 'all time'
};

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
  
  // Memoize all derived values to prevent recalculation on unrelated state changes
  const { contextualPrompt, triggerText, description, hasHistoryData } = useMemo(() => {
    const hasHistory = portfolioHistory && portfolioHistory.equity && portfolioHistory.equity.length > 0;
    
    // Calculate return data
    let returnData: { returnAmount: number | null; returnPercent: number | null; currentValue: number | null } | null = null;
    if (hasHistory && portfolioHistory) {
      const plArray = portfolioHistory.profit_loss || [];
      const plPctArray = portfolioHistory.profit_loss_pct || [];
      const lastPl = plArray.length ? plArray[plArray.length - 1] : null;
      const lastPlPct = plPctArray.length ? plPctArray[plPctArray.length - 1] : null;
      const currentVal = portfolioHistory.equity[portfolioHistory.equity.length - 1];
      
      returnData = {
        returnAmount: lastPl,
        returnPercent: lastPlPct !== null ? lastPlPct * 100 : null,
        currentValue: currentVal
      };
    }
    
    // Generate prompt
    let prompt: string;
    if (!accountId || disabled) {
      prompt = "Can you explain how to evaluate investment performance - what matters, what doesn't, and how to stay focused on long-term goals?";
    } else if (!hasHistory) {
      prompt = "My portfolio is new so there isn't much performance history to show. What should I keep an eye on as it grows, and how do I measure progress in a healthy way?";
    } else {
      const timeLabel = TIME_RANGE_LABELS[selectedTimeRange] || selectedTimeRange;
      
      // Build a highly personalized prompt with actual numbers
      let promptParts = [`My portfolio performance for ${timeLabel}:`];
      promptParts.push(`• Current Value: ${formatCurrency(returnData?.currentValue ?? null)}`);
      
      if (returnData && returnData.returnAmount !== null && returnData.returnPercent !== null) {
        const sign = returnData.returnAmount >= 0 ? '+' : '';
        promptParts.push(`• Return: ${sign}${formatCurrency(returnData.returnAmount)} (${sign}${returnData.returnPercent.toFixed(2)}%)`);
      }
      
      if (allTimeReturnAmount != null && allTimeReturnPercent != null && selectedTimeRange !== 'ALL') {
        const allTimeSign = allTimeReturnAmount >= 0 ? '+' : '';
        promptParts.push(`• All-Time Return: ${allTimeSign}${formatCurrency(allTimeReturnAmount)} (${allTimeSign}${(allTimeReturnPercent * 100).toFixed(2)}%)`);
      }
      
      promptParts.push('');
      promptParts.push(`How am I doing? Is this return good, average, or concerning for someone investing long-term? What's driving my performance - which holdings are helping or hurting the most?`);
      
      prompt = promptParts.join('\n');
    }
    
    // Generate trigger text and description
    let trigger: string;
    let desc: string;
    if (!accountId || disabled) {
      trigger = "Analyze progress";
      desc = "Learn how to track and evaluate investment performance";
    } else if (!hasHistory) {
      trigger = "Understand this";
      desc = "Understand what to expect as your portfolio grows";
    } else {
      trigger = "Analyze progress";
      desc = "Get insights on your investment performance and what it means for your financial goals";
    }
    
    return {
      contextualPrompt: prompt,
      triggerText: trigger,
      description: desc,
      hasHistoryData: hasHistory
    };
  }, [accountId, disabled, portfolioHistory, selectedTimeRange, allTimeReturnAmount, allTimeReturnPercent]);

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
                filterAccount={selectedAccountFilter !== 'total' ? selectedAccountFilter : null}
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
      prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
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
                filterAccount={selectedAccountFilter !== 'total' ? selectedAccountFilter : null}
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