'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { WeeklyStockPick } from '@/lib/types/weekly-stock-picks';

interface StockPick extends WeeklyStockPick {
  // Simple interface - no crowded fields
}

interface StockPicksCardProps {
  stockPicks: StockPick[];
  onStockSelect: (symbol: string) => void;
  lastGenerated?: string | null;
  isLoading?: boolean;
  isNewUser?: boolean; // Show special loading state for new users
}

// Component for individual stock pick cards - clean, simple design
function StockPickItem({ stock, onStockSelect }: { stock: StockPick; onStockSelect: (symbol: string) => void }) {
  const { logoUrl, displayName } = useCompanyProfile(stock.ticker);

  return (
    <Card 
      className="border hover:shadow-md transition-shadow cursor-pointer group h-[140px] flex flex-col"
      onClick={() => onStockSelect(stock.ticker)}
    >
      <CardContent className="p-3 flex flex-col h-full">
        <div className="flex flex-col h-full">
          {/* Header with logo and ticker */}
          <div className="flex items-center gap-2 mb-1">
            <CompanyLogo
              symbol={stock.ticker}
              companyName={stock.company_name}
              imageUrl={logoUrl || undefined}
              size="sm"
            />
            <div className="text-sm font-bold truncate flex-1">{stock.ticker}</div>
          </div>
          
          {/* Company name with gap below */}
          <div className="text-xs text-muted-foreground line-clamp-1 mb-2">
            {stock.company_name}
          </div>
          
          {/* Rationale - properly contained with no overflow */}
          <div className="text-xs text-blue-600 dark:text-blue-400 line-clamp-3 group-hover:text-blue-800 dark:group-hover:text-blue-300 flex-1 overflow-hidden">
            {stock.rationale}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
 // Production-grade: No static fallbacks - handle states properly

export default function StockPicksCard({ stockPicks, onStockSelect, lastGenerated, isLoading = false, isNewUser = false }: StockPicksCardProps) {
  
  // New user loading state - show helpful message while data is being generated
  if (isNewUser) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Stock Picks From Clera</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center space-y-4 py-8">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Generating Your Personalized Picks</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Our AI is analyzing your preferences and market conditions to create your personalized stock recommendations. This usually takes just a few minutes.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state - show skeleton while data is being fetched
  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Stock Picks From Clera</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {/* Mobile: 2 columns, 3 rows | Desktop: 3 columns, 2 rows */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 h-full">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-[140px] bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Production-grade: If no stock picks and not a new user, something went wrong
  if (stockPicks.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Stock Picks From Clera</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center space-y-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-foreground">Unable to Load Picks</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              We're having trouble loading your personalized picks. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show actual personalized data
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Stock Picks From Clera</CardTitle>
          {lastGenerated && process.env.NODE_ENV !== 'production' && (
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
          {stockPicks.slice(0, 6).map((stock, index) => (
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