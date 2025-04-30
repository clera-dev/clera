"use client";

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

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
    // Assuming the input is like '0.05' for 5% - multiply by 100
    if (numericValue === null || isNaN(numericValue)) return '--.--%';
    return `${(numericValue * 100).toFixed(2)}%`;
};

const HoldingsTable: React.FC<HoldingsTableProps> = ({ positions, isLoading }) => {

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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">Symbol</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Avg Cost</TableHead>
          <TableHead>Market Value</TableHead>
          <TableHead>Day's Gain</TableHead>
          <TableHead className="text-right">Total Gain</TableHead>
          <TableHead className="text-right">Portfolio %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos) => {
          const isGainPositive = parseFloat(pos.unrealized_pl) >= 0;
          const isDayGainPositive = parseFloat(pos.change_today) >= 0; // Or use unrealized_intraday_pl
          const gainColor = isGainPositive ? 'text-green-500' : 'text-red-500';
          const dayGainColor = isDayGainPositive ? 'text-green-500' : 'text-red-500';

          return (
            <TableRow key={pos.asset_id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span>{pos.symbol}</span>
                  <span className="text-xs text-muted-foreground truncate" title={pos.name || pos.symbol}>{pos.name || pos.symbol}</span>
                </div>
              </TableCell>
              <TableCell>{parseFloat(pos.qty).toLocaleString()}</TableCell>
              <TableCell>{formatCurrency(pos.avg_entry_price)}</TableCell>
              <TableCell>{formatCurrency(pos.market_value)}</TableCell>
              <TableCell className={dayGainColor}>
                 <div className="flex items-center">
                    {isDayGainPositive ? <ArrowUpRight className="h-3 w-3 mr-1"/> : <ArrowDownRight className="h-3 w-3 mr-1"/>}
                    {formatCurrency(pos.unrealized_intraday_pl)} ({formatPercentage(pos.unrealized_intraday_plpc)})
                 </div>
              </TableCell>
              <TableCell className={`${gainColor} text-right`}>
                <div className="flex flex-col items-end">
                     <span>{formatCurrency(pos.unrealized_pl)}</span>
                     <span className="text-xs">({formatPercentage(pos.unrealized_plpc)})</span>
                </div>
                </TableCell>
              <TableCell className="text-right">{pos.weight !== undefined ? `${pos.weight.toFixed(2)}%` : '--%'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default HoldingsTable; 