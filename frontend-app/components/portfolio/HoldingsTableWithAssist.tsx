"use client";

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';
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
  onInvestClick?: (symbol: string) => void;
  onSellClick?: (symbol: string, currentQty: string) => void;
  accountId?: string | null;
}

// Pure utility functions defined outside component
const formatCurrencyWithSign = (value: number): string => {
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${absValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercentWithSign = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
};

const COMMON_ETFS = new Set(['SPY', 'VOO', 'VTI', 'QQQ', 'IWM', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'SLV']);

// Number of positions to show before collapsing
const COLLAPSE_THRESHOLD = 5;

const HoldingsTableWithAssist: React.FC<HoldingsTableWithAssistProps> = ({
  positions,
  isLoading,
  disabled = false,
  onInvestClick,
  onSellClick,
  accountId
}) => {
  const { openChatWithPrompt, isEnabled } = useCleraAssist();
  
  // Collapsible state - auto-expand if few positions, collapse if many
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldShowCollapseButton = positions.length > COLLAPSE_THRESHOLD;
  
  // Memoize all calculations and prompt generation
  // Only recalculates when positions array or disabled flag changes
  const { contextualPrompt, triggerText, description } = useMemo(() => {
    if (disabled) {
      return {
        contextualPrompt: "Can you explain how to think about building a portfolio? I'm curious about the difference between individual stocks vs ETFs, and how to approach diversification.",
        triggerText: "Learn about this",
        description: "Understand portfolio building and investment selection"
      };
    }
    
    if (positions.length === 0) {
      return {
        contextualPrompt: "I'm ready to start investing. What's a sensible approach for building a first portfolio - keeping it simple while still being diversified?",
        triggerText: "Get started",
        description: "Get guidance on building your first portfolio"
      };
    }
    
    // Calculate totals
    const totalPL = positions.reduce((sum, pos) => sum + parseFloat(pos.unrealized_pl || '0'), 0);
    const totalValue = positions.reduce((sum, pos) => sum + parseFloat(pos.market_value || '0'), 0);
    const totalCostBasis = positions.reduce((sum, pos) => sum + parseFloat(pos.cost_basis || '0'), 0);
    const totalPLPercent = totalCostBasis > 0 ? (totalPL / totalCostBasis) : 0;
    
    // Sort positions by P&L to find winners and losers
    const sortedByPL = [...positions].sort((a, b) => 
      parseFloat(b.unrealized_pl || '0') - parseFloat(a.unrealized_pl || '0')
    );
    
    // Get top 3 winners and losers
    const winners = sortedByPL.filter(p => parseFloat(p.unrealized_pl || '0') > 0).slice(0, 3);
    const losers = sortedByPL.filter(p => parseFloat(p.unrealized_pl || '0') < 0).slice(-3).reverse();
    
    // Check for ETFs vs individual stocks
    const hasETFs = positions.some(pos => pos.symbol.includes('ETF') || COMMON_ETFS.has(pos.symbol));
    const hasIndividualStocks = positions.some(pos => !pos.symbol.includes('ETF') && !COMMON_ETFS.has(pos.symbol));
    
    // Build concise holdings summary
    let prompt = `I have ${positions.length} positions worth $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0 })} total, `;
    prompt += `with overall P&L of ${formatCurrencyWithSign(totalPL)} (${formatPercentWithSign(totalPLPercent)}). `;
    prompt += `Mix: ${hasETFs && hasIndividualStocks ? 'ETFs + individual stocks' : hasETFs ? 'ETFs only' : 'individual stocks'}.\n\n`;
    
    // Highlight winners and losers concisely
    if (winners.length > 0) {
      const winnersList = winners.slice(0, 2).map(p => p.symbol).join(', ');
      prompt += `Top performers: ${winnersList}. `;
    }
    if (losers.length > 0) {
      const losersList = losers.slice(0, 2).map(p => p.symbol).join(', ');
      prompt += `Underperformers: ${losersList}.\n\n`;
    }
    
    prompt += `Which holdings should I consider adding to or trimming? Any gaps I should fill?`;
    
    return {
      contextualPrompt: prompt,
      triggerText: "Analyze holdings",
      description: "Get recommendations on positions to add, trim, or rebalance"
    };
  }, [positions, disabled]);

  // Get visible positions based on expand/collapse state
  const visiblePositions = shouldShowCollapseButton && !isExpanded 
    ? positions.slice(0, COLLAPSE_THRESHOLD) 
    : positions;
  
  // Collapse/expand button component
  const CollapseButton = () => {
    if (!shouldShowCollapseButton) return null;
    
    return (
      <div className="flex justify-center py-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground gap-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show all {positions.length} holdings
            </>
          )}
        </Button>
      </div>
    );
  };

  if (!isEnabled) {
    // Fallback to original component when assist is disabled
    return (
      <Card className="bg-card shadow-lg mt-4">
        <CardContent className="p-0">
          {isLoading && positions.length === 0 ? (
            <Skeleton className="h-64 w-full rounded-t-none" />
          ) : positions.length > 0 ? (
            <>
              <HoldingsTable 
                positions={visiblePositions} 
                onInvestClick={onInvestClick}
                onSellClick={onSellClick}
                accountId={accountId}
              />
              <CollapseButton />
            </>
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
      prompt={contextualPrompt}
      triggerText={triggerText}
      description={description}
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "holdings_analysis")}
      disabled={disabled}
      className="bg-card shadow-lg mt-4"
    >
      <div className="p-0">
        {isLoading && positions.length === 0 ? (
          <Skeleton className="h-64 w-full rounded-t-none" />
        ) : positions.length > 0 ? (
          <>
            <HoldingsTable 
              positions={visiblePositions} 
              onInvestClick={onInvestClick}
              onSellClick={onSellClick}
              accountId={accountId}
            />
            <CollapseButton />
          </>
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