import React from 'react';
import { CompanyLogo } from '@/components/ui/CompanyLogo';
import { useCompanyProfiles } from '@/hooks/useCompanyProfile';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface RelevantStocksProps {
  tickers: string[];
  onStockSelect: (symbol: string) => void;
  maxDisplay?: number;
}

export function RelevantStocks({ tickers, onStockSelect, maxDisplay = 5 }: RelevantStocksProps) {
  const displayTickers = tickers.slice(0, maxDisplay);
  const { profiles, loading, getProfile, hasError } = useCompanyProfiles(displayTickers);

  if (loading) {
    return (
      <div className="flex flex-wrap gap-2">
        {displayTickers.map((ticker, index) => (
          <div key={ticker} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
            <Skeleton className="w-6 h-6 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (displayTickers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {displayTickers.map((ticker) => {
          const profile = getProfile(ticker);
          const hasProfileError = hasError(ticker);
          
          return (
            <button
              key={ticker}
              onClick={() => onStockSelect(ticker)}
              className="flex items-center gap-2 p-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer group text-left"
              title={profile?.companyName || ticker}
            >
              <CompanyLogo
                symbol={ticker}
                companyName={profile?.companyName}
                imageUrl={profile?.image || undefined}
                size="sm"
                className="border"
              />
              <div className="flex flex-col min-w-0">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">
                  {ticker}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-[80px]">
                  {profile?.companyName 
                    ? profile.companyName.length > 15 
                      ? `${profile.companyName.substring(0, 15)}...`
                      : profile.companyName
                    : hasProfileError 
                      ? 'Unknown'
                      : 'Loading...'
                  }
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
} 