'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';

interface StockPick {
  ticker: string;
  company_name: string;
  rationale: string;
}

interface StockPicksCardProps {
  stockPicks: StockPick[];
  onStockSelect: (symbol: string) => void;
  lastGenerated?: string | null;
  isLoading?: boolean;
}

// Component for individual stock pick cards with company logos
function StockPickItem({ stock, onStockSelect }: { stock: StockPick; onStockSelect: (symbol: string) => void }) {
  const { logoUrl, displayName } = useCompanyProfile(stock.ticker);

  return (
    <Card 
      className="border hover:shadow-md transition-shadow cursor-pointer group h-[140px] flex flex-col"
      onClick={() => onStockSelect(stock.ticker)}
    >
      <CardContent className="p-3 flex flex-col h-full">
        <div className="flex flex-col space-y-2 h-full">
          <div className="flex items-center gap-2 mb-1 min-h-[24px]">
            <CompanyLogo
              symbol={stock.ticker}
              companyName={stock.company_name}
              imageUrl={logoUrl || undefined}
              size="sm"
            />
            <div className="text-sm font-bold truncate flex-1">{stock.ticker}</div>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2 min-h-[28px] flex-1">
            {stock.company_name}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 line-clamp-2 group-hover:text-blue-800 dark:group-hover:text-blue-300 flex-1">
            {stock.rationale.substring(0, 60)}...
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Static fallback stock picks
const STATIC_STOCK_PICKS = [
  { ticker: 'NVDA', company_name: 'NVIDIA Corporation', rationale: 'AI infrastructure leader with strong growth potential' },
  { ticker: 'CRWD', company_name: 'CrowdStrike Holdings, Inc.', rationale: 'Cybersecurity leader with expanding market share' },
  { ticker: 'BNTX', company_name: 'BioNTech SE', rationale: 'Innovative mRNA technology with pipeline potential' },
  { ticker: 'SEZL', company_name: 'Sezzle Inc.', rationale: 'Growing buy-now-pay-later platform' },
  { ticker: 'GEV', company_name: 'GE Vernova', rationale: 'Clean energy infrastructure leader' },
  { ticker: 'QCOM', company_name: 'Qualcomm Incorporated', rationale: '5G and mobile technology innovations' },
];

export default function StockPicksCard({ stockPicks, onStockSelect, lastGenerated, isLoading = false }: StockPicksCardProps) {
  const displayStockPicks = stockPicks.length > 0 ? stockPicks : STATIC_STOCK_PICKS;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Stock Picks From Clera</CardTitle>
          {lastGenerated && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Updated: {lastGenerated}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {/* Mobile: 2 columns, 3 rows | Desktop: 3 columns, 2 rows */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 h-full">
          {displayStockPicks.slice(0, 6).map((stock, index) => (
            <StockPickItem 
              key={stock.ticker}
              stock={stock}
              onStockSelect={onStockSelect}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 