"use client";

import React, { useMemo } from 'react';
import AssetAllocationPie from './AssetAllocationPie';
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist } from '@/components/ui/clera-assist-provider';

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

interface AssetAllocationPieWithAssistProps {
  positions: PositionData[];
  accountId: string | null;
  refreshTimestamp: number;
  isLoading?: boolean;
  error?: string | null;
  skeletonContent?: React.ReactNode;
  disabled?: boolean; // Disable when no trade history
  selectedAccountFilter?: 'total' | string;  // Account filter
  userId?: string;  // User ID for aggregation mode
}

// Pure utility function defined outside component
const formatCurrencyCompact = (value: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const AssetAllocationPieWithAssist: React.FC<AssetAllocationPieWithAssistProps> = ({
  positions,
  accountId,
  refreshTimestamp,
  isLoading = false,
  error = null,
  skeletonContent,
  disabled = false,
  selectedAccountFilter = 'total',
  userId
}) => {
  const { openChatWithPrompt, isEnabled, sideChatVisible } = useCleraAssist();
  
  // Memoize all allocation calculations and prompt generation
  // Only recalculates when positions array actually changes
  const contextualPrompt = useMemo(() => {
    if (positions.length === 0) {
      return "Can you explain the basics of asset allocation? I'd like to understand how to think about spreading investments across different types of assets.";
    }
    
    // Calculate total value
    const totalValue = positions.reduce((sum, pos) => sum + (parseFloat(pos.market_value) || 0), 0);
    if (totalValue === 0) {
      return "Can you explain the basics of asset allocation? I'd like to understand how to think about spreading investments across different types of assets.";
    }
    
    // Get top holdings sorted by weight
    const positionsWithWeight = positions.map(pos => ({
      symbol: pos.symbol,
      marketValue: parseFloat(pos.market_value) || 0,
      weight: (parseFloat(pos.market_value) || 0) / totalValue * 100,
      assetClass: pos.asset_class || 'other'
    })).sort((a, b) => b.weight - a.weight);
    
    // Get top 5 holdings for the prompt
    const topHoldings = positionsWithWeight.slice(0, 5);
    
    // Calculate concentration metrics
    const top1Concentration = topHoldings.length > 0 ? topHoldings[0].weight : 0;
    const top3Concentration = topHoldings.slice(0, 3).reduce((sum, pos) => sum + pos.weight, 0);
    
    // Group by asset class
    const assetClassBreakdown: Record<string, number> = {};
    positionsWithWeight.forEach(pos => {
      assetClassBreakdown[pos.assetClass] = (assetClassBreakdown[pos.assetClass] || 0) + pos.marketValue;
    });
    
    // Build concise allocation summary
    const topHoldingsList = topHoldings.slice(0, 3).map(p => `${p.symbol} (${p.weight.toFixed(0)}%)`).join(', ');
    
    let prompt = `I have ${positions.length} holdings worth ${formatCurrencyCompact(totalValue)} total. `;
    prompt += `My largest positions are ${topHoldingsList}. `;
    prompt += `My top holding is ${top1Concentration.toFixed(0)}% of my portfolio and top 3 are ${top3Concentration.toFixed(0)}% combined.\n\n`;
    prompt += `Is my portfolio too concentrated? Am I missing any important sectors or asset classes for better diversification?`;
    
    return prompt;
  }, [positions]); // Only depends on positions array

  if (!isEnabled) {
    return (
      <div className="h-72 w-full">
        {skeletonContent}
      </div>
    );
  }

  return (
    <CleraAssistCard
      title="Asset Allocation"
      content="Asset allocation breakdown"
      context="portfolio_allocation"
      prompt={contextualPrompt}
      triggerText="Ask about allocation"
      description="Understand if your investment mix is right for you"
      onAssistClick={(prompt) => openChatWithPrompt(prompt, "portfolio_allocation")}
      isLoading={isLoading}
      error={error}
      skeletonContent={skeletonContent}
      disabled={disabled}
    >
      <AssetAllocationPie
        positions={positions}
        accountId={accountId}
        refreshTimestamp={refreshTimestamp}
        sideChatVisible={sideChatVisible}
        selectedAccountFilter={selectedAccountFilter}
        userId={userId}
      />
    </CleraAssistCard>
  );
};

export default AssetAllocationPieWithAssist; 