'use client';

import { useState } from 'react';
import StockSearchBar from '@/components/invest/StockSearchBar';
import StockInfoCard from '@/components/invest/StockInfoCard';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function InvestPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const handleStockSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Invest</h2>
        </div>
        
        {/* Search Bar Area */}
        <div className="mb-6">
          <StockSearchBar onStockSelect={handleStockSelect} />
        </div>

        {/* Stock Info Display Area */}
        <div className="mt-6">
          {selectedSymbol ? (
            <StockInfoCard symbol={selectedSymbol} />
          ) : (
            <div className="text-center text-muted-foreground py-10">
              Search for a stock symbol above to see details.
            </div>
          )}
        </div>

      </div>
    </ScrollArea>
  );
} 