"use client";

import React from 'react';
import AssetAllocationPie from './AssetAllocationPie';
import CleraAssistCard from '@/components/ui/clera-assist-card';
import { useCleraAssist, useContextualPrompt } from '@/components/ui/clera-assist-provider';

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
}

const AssetAllocationPieWithAssist: React.FC<AssetAllocationPieWithAssistProps> = ({
  positions,
  accountId,
  refreshTimestamp,
  isLoading = false,
  error = null,
  skeletonContent,
  disabled = false
}) => {
  const { openChatWithPrompt, isEnabled, sideChatVisible } = useCleraAssist();
  
  // Calculate allocation percentages
  const totalValue = positions.reduce((sum, pos) => sum + (parseFloat(pos.market_value) || 0), 0);
  const stocksPercentage = Math.round(
    (positions
      .filter(pos => pos.asset_class === 'us_equity')
      .reduce((sum, pos) => sum + (parseFloat(pos.market_value) || 0), 0) / totalValue) * 100
  );
  
  // Create allocation context description
  const allocationContext = positions.length === 0 ? "no holdings yet"
    : positions.length === 1 ? "a single holding"
    : stocksPercentage >= 90 ? `${stocksPercentage}% stocks (heavily concentrated)`
    : stocksPercentage >= 70 ? `${stocksPercentage}% stocks (stock-heavy allocation)`
    : stocksPercentage >= 50 ? `${stocksPercentage}% stocks (balanced allocation)`
    : `${stocksPercentage}% stocks (conservative allocation)`;
  
  // Create contextual prompt with allocation data
  const generatePrompt = useContextualPrompt(
    "Assess my asset allocation: {numPositions} holdings with {allocationContext}. Is this sensible for a long-term investor? Recommend 1–2 concrete tweaks.",
    "portfolio_allocation",
    {
      numPositions: positions.length.toString(),
      allocationContext: allocationContext
    }
  );

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
      prompt={generatePrompt()}
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
      />
    </CleraAssistCard>
  );
};

export default AssetAllocationPieWithAssist; 