"use client";

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import TradeActionButtons from './TradeActionButtons';

// Re-use or import the PositionData interface from page.tsx or a shared types file
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
    name?: string; // Added in page.tsx
    weight?: number; // Added in page.tsx
}

interface HoldingsTableProps {
  positions: PositionData[];
  isLoading?: boolean; // Optional loading state from parent
  onInvestClick?: (symbol: string) => void;
  onSellClick?: (symbol: string, currentQty: string) => void;
  accountId?: string | null;
}

// Helper to format currency
const formatCurrency = (value: string | number | null | undefined, digits = 2): string => {
    let numericValue: number | null;
    if (typeof value === 'string') {
        numericValue = parseFloat(value);
    } else if (typeof value === 'number') {
        numericValue = value;
    } else {
        numericValue = null;
    }

    if (numericValue === null || isNaN(numericValue)) return '$--.--';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(numericValue);
};

// Helper to format percentage
const formatPercentage = (value: string | number | null | undefined): string => {
    let numericValue: number | null;
    if (typeof value === 'string') {
        numericValue = parseFloat(value);
    } else if (typeof value === 'number') {
        numericValue = value;
    } else {
        numericValue = null;
    }

    if (numericValue === null || isNaN(numericValue)) return '--.--%';
    return `${numericValue.toFixed(2)}%`;
};

const HoldingsTable: React.FC<HoldingsTableProps> = ({ 
  positions, 
  isLoading, 
  onInvestClick,
  onSellClick,
  accountId 
}) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Check if trade actions are available
  const hasTradeActions = onInvestClick && onSellClick && accountId;

  if (isLoading) {
    return (
        <div className="p-4">
            <Skeleton className="h-8 w-full mb-4" />
            <Skeleton className="h-8 w-full mb-2" />
            <Skeleton className="h-8 w-full mb-2" />
            <Skeleton className="h-8 w-full mb-2" />
        </div>
    );
  }

  if (!positions || positions.length === 0) {
    return <p className="text-muted-foreground p-6 text-center">You currently have no holdings.</p>;
  }

  const handleRowClick = (assetId: string, isMobile: boolean) => {
    if (isMobile && hasTradeActions) {
      setExpandedRow(expandedRow === assetId ? null : assetId);
    }
  };

  const handleInvestClick = (symbol: string) => {
    if (onInvestClick) {
      onInvestClick(symbol);
    }
  };

  const handleSellClick = (symbol: string, qty: string) => {
    if (onSellClick) {
      onSellClick(symbol, qty);
    }
  };

  return (
    <div className="w-full">
      {/* Desktop View */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Initial Price</TableHead>
              <TableHead>Current Price</TableHead>
              <TableHead>Number of Shares</TableHead>
              <TableHead>Market Value</TableHead>
              <TableHead>Total Return</TableHead>
              <TableHead className="text-right">Weight (%)</TableHead>
              {hasTradeActions && <TableHead className="text-right w-[120px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos) => {
              const isGainPositive = parseFloat(pos.unrealized_pl) >= 0;
              const gainColor = isGainPositive ? 'text-green-500' : 'text-red-500';
              const returnPercent = parseFloat(pos.unrealized_plpc) * 100;
              const isHovered = hoveredRow === pos.asset_id;

              return (
                <TableRow 
                  key={pos.asset_id}
                  className="group relative"
                  onMouseEnter={() => setHoveredRow(pos.asset_id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <TableCell className="font-medium">
                    <span className="truncate" title={pos.name || pos.symbol}>{pos.name || pos.symbol}</span>
                  </TableCell>
                  <TableCell>{pos.symbol}</TableCell>
                  <TableCell>{formatCurrency(pos.avg_entry_price)}</TableCell>
                  <TableCell>{formatCurrency(pos.current_price)}</TableCell>
                  <TableCell>{parseFloat(pos.qty).toLocaleString()}</TableCell>
                  <TableCell>{formatCurrency(pos.market_value)}</TableCell>
                  <TableCell className={gainColor}>
                    <div className="flex items-center">
                      {isGainPositive ? <ArrowUpRight className="h-3 w-3 mr-1"/> : <ArrowDownRight className="h-3 w-3 mr-1"/>}
                      {formatPercentage(returnPercent)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{pos.weight !== undefined ? `${pos.weight.toFixed(2)}%` : '--%'}</TableCell>
                  {hasTradeActions && (
                    <TableCell className="text-right">
                      <div className={`transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <TradeActionButtons
                          symbol={pos.symbol}
                          onInvestClick={handleInvestClick}
                          onSellClick={(symbol) => handleSellClick(symbol, pos.qty)}
                          variant="minimal"
                          size="sm"
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden">
        <div className="space-y-2">
          {positions.map((pos) => {
            const isGainPositive = parseFloat(pos.unrealized_pl) >= 0;
            const gainColor = isGainPositive ? 'text-green-500' : 'text-red-500';
            const returnPercent = parseFloat(pos.unrealized_plpc) * 100;
            const isExpanded = expandedRow === pos.asset_id;

            return (
              <div key={pos.asset_id} className="border rounded-lg bg-card">
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => handleRowClick(pos.asset_id, true)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-sm truncate pr-2" title={pos.name || pos.symbol}>
                          {pos.name || pos.symbol}
                        </h3>
                        <span className="text-xs text-muted-foreground">{pos.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">{formatCurrency(pos.market_value)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {parseFloat(pos.qty).toLocaleString()} shares
                          </span>
                        </div>
                        <div className={`flex items-center text-sm ${gainColor}`}>
                          {isGainPositive ? <ArrowUpRight className="h-3 w-3 mr-1"/> : <ArrowDownRight className="h-3 w-3 mr-1"/>}
                          {formatPercentage(returnPercent)}
                        </div>
                      </div>
                    </div>
                    {hasTradeActions && (
                      <div className="ml-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Expanded Actions - Mobile */}
                {hasTradeActions && isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/50">
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>Initial: {formatCurrency(pos.avg_entry_price)}</div>
                        <div>Current: {formatCurrency(pos.current_price)}</div>
                        <div>Weight: {pos.weight !== undefined ? `${pos.weight.toFixed(2)}%` : '--'}</div>
                        <div>Exchange: {pos.exchange}</div>
                      </div>
                      <div className="pt-2">
                        <TradeActionButtons
                          symbol={pos.symbol}
                          onInvestClick={handleInvestClick}
                          onSellClick={(symbol) => handleSellClick(symbol, pos.qty)}
                          variant="inline"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HoldingsTable; 