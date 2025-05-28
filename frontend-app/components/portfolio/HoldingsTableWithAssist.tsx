"use client";

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';
import HoldingsTable from './HoldingsTable';

interface PositionData {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  avg_entry_price: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
  asset_marginable?: boolean | null;
  asset_shortable?: boolean | null;
  asset_easy_to_borrow?: boolean | null;
  name?: string;
  weight?: number;
}

interface HoldingsTableWithAssistProps {
  positions: PositionData[];
  isLoading: boolean;
  disabled?: boolean;
}

const HoldingsTableWithAssist: React.FC<HoldingsTableWithAssistProps> = ({
  positions,
  isLoading,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Extract holdings context for dynamic prompts
  const numHoldings = positions.length;
  const hasETFs = positions.some(pos => pos.symbol.includes('ETF') || ['SPY', 'VOO', 'VTI', 'QQQ', 'IWM'].includes(pos.symbol));
  const hasIndividualStocks = positions.some(pos => !pos.symbol.includes('ETF') && !['SPY', 'VOO', 'VTI', 'QQQ', 'IWM'].includes(pos.symbol));
  
  const totalValue = positions.reduce((sum, pos) => sum + parseFloat(pos.market_value || '0'), 0);
  const hasWinners = positions.some(pos => parseFloat(pos.unrealized_pl || '0') > 0);
  const hasLosers = positions.some(pos => parseFloat(pos.unrealized_pl || '0') < 0);
  
  const holdingsContext = numHoldings === 1 ? "a single holding"
    : numHoldings <= 3 ? "a few holdings"
    : numHoldings <= 10 ? "several holdings"
    : "many holdings";
  
  const diversificationContext = hasETFs && hasIndividualStocks ? "a mix of ETFs and individual stocks"
    : hasETFs ? "primarily ETFs"
    : "individual stocks";
  
  const performanceContext = hasWinners && hasLosers ? "some gains and some losses"
    : hasWinners ? "mostly gains"
    : hasLosers ? "some current losses"
    : "neutral performance";

  // Create contextual prompt with holdings analysis
  const generatePrompt = useContextualPrompt(
    "I'm looking at my holdings showing {holdingsContext} with {diversificationContext} and {performanceContext}. Can you quickly evaluate my holdings strategy and suggest 1-2 improvements?",
    "holdings_analysis",
    {
      holdingsContext: holdingsContext,
      diversificationContext: diversificationContext,
      performanceContext: performanceContext,
      numHoldings: numHoldings.toString()
    }
  );

  const getContextualPrompt = () => {
    if (disabled) {
      return "I'm interested in learning about building a stock portfolio. Can you explain what makes a good holding, how to think about diversification, and what young investors should look for when choosing individual stocks versus ETFs?";
    }
    
    if (positions.length === 0) {
      return "I'm looking at my holdings section but don't have any positions yet. Can you explain how to choose my first investments and what young investors should consider when building their initial portfolio?";
    }
    
    return generatePrompt();
  };

  const getTriggerText = () => {
    if (disabled) return "Learn about holdings";
    if (positions.length === 0) return "Choosing first investments";
    return "Evaluate my holdings";
  };

  const getDescription = () => {
    if (disabled) return "Learn about building a diversified portfolio and choosing good investments";
    if (positions.length === 0) return "Get guidance on selecting your first investments";
    return "Understand your current holdings and how to optimize your portfolio";
  };

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="bg-card shadow-lg mt-4">
        <CardContent className="p-0">
          {isLoading && positions.length === 0 ? (
            <Skeleton className="h-64 w-full rounded-t-none" />
          ) : positions.length > 0 ? (
            <HoldingsTable positions={positions} />
          ) : (
            <p className="text-muted-foreground p-6 text-center">
              Waiting for your first trade to display holdings.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <CleraAssistCard
      title="Your Holdings"
      content="Individual position details and performance"
      context="holdings_analysis"
      prompt={getContextualPrompt()}
      triggerText={getTriggerText()}
      description={getDescription()}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "holdings_analysis")}
      disabled={disabled}
      className="bg-card shadow-lg mt-4"
    >
      <div className="p-0">
        {isLoading && positions.length === 0 ? (
          <Skeleton className="h-64 w-full rounded-t-none" />
        ) : positions.length > 0 ? (
          <HoldingsTable positions={positions} />
        ) : (
          <p className="text-muted-foreground p-6 text-center">
            Waiting for your first trade to display holdings.
          </p>
        )}
      </div>
    </CleraAssistCard>
  );
};

export default HoldingsTableWithAssist; 