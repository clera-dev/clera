'use client'

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Minus, Star, AlertCircle, Loader2 } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

import StockSearchBar from "./StockSearchBar";
import MiniStockChart from "./MiniStockChart";
import { useCompanyProfiles } from "@/hooks/useCompanyProfile";
import { useWatchlistData, type WatchlistItem } from "@/hooks/useWatchlistData";
import { useMarketPercentages } from "@/hooks/useMarketPercentages";

interface StockWatchlistProps {
  accountId: string | null;
  onStockSelect?: (symbol: string) => void;
  watchlistSymbols?: Set<string>;
  onWatchlistChange?: () => void;
  onOptimisticAdd?: (symbol: string) => void;
  onOptimisticRemove?: (symbol: string) => void;
}

export default function StockWatchlist({ accountId, onStockSelect, watchlistSymbols, onWatchlistChange, onOptimisticAdd, onOptimisticRemove }: StockWatchlistProps) {
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  // Use the extracted data management hook
  const {
    watchlistData,
    isLoading,
    isInitialLoading,
    isUpdatingWatchlist,
    hasAttemptedLoad,
    loadingProgress,
    error,
    addToWatchlist,
    removeFromWatchlist,
    setError
  } = useWatchlistData({
    accountId,
    watchlistSymbols,
    onWatchlistChange,
    onOptimisticAdd,
    onOptimisticRemove,
  });

  // Get company profiles for logo display
  const symbols = watchlistData.map(item => item.symbol);
  const { profiles, getProfile } = useCompanyProfiles(symbols);

  // Get market percentages for the symbols
  const { percentages, isCalculating, progress } = useMarketPercentages(symbols);


  const handleStockSelect = async (symbol: string) => {
    setIsSearchDialogOpen(false);
    if (onStockSelect) {
      onStockSelect(symbol);
    }
  };

  const handleWatchlistItemClick = (symbol: string) => {
    handleStockSelect(symbol);
  };

  const renderWatchlistItem = (item: WatchlistItem) => {
    const profile = getProfile(item.symbol);
    // Get percentage from the percentages map (calculated by useMarketPercentages)
    const calculatedPercentage = percentages.get(item.symbol);
    // Check if we have a valid calculated percentage (could be positive, negative, or zero)
    const hasCalculatedPercentage = calculatedPercentage !== undefined;
    // Use calculated percentage if available, otherwise treat as loading
    const dayChangePercent = hasCalculatedPercentage ? calculatedPercentage : undefined;
    
    const getReturnColor = (percent: number) => {
      if (percent > 0) return 'text-green-500';
      if (percent < 0) return 'text-red-500';
      return 'text-white';
    };

    const formatReturnPercent = (percent: number) => {
      const sign = percent >= 0 ? '+' : '';
      return `${sign}${percent.toFixed(2)}%`;
    };
    
    return (
      <div 
        key={item.symbol}
        className="flex items-center p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-all duration-200 group"
        onClick={() => handleWatchlistItemClick(item.symbol)}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <CompanyLogo
            symbol={item.symbol}
            companyName={profile?.companyName || item.companyName || item.symbol}
            imageUrl={profile?.image || undefined}
            size="sm"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm">{item.symbol}</span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromWatchlist(item.symbol);
                }}
                disabled={isUpdatingWatchlist}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground truncate block">
              {profile?.companyName || item.companyName || 'Loading...'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-center w-20 flex-shrink-0 mr-3">
          {item.isLoading ? (
            <div className="w-16 h-4 bg-muted animate-pulse rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">...</span>
            </div>
          ) : hasCalculatedPercentage ? (
            <div className={`text-sm font-semibold transition-all duration-300 ${getReturnColor(dayChangePercent!)}`}>
              {formatReturnPercent(dayChangePercent!)}
            </div>
          ) : isCalculating ? (
            <div className="w-16 h-4 bg-muted animate-pulse rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">...</span>
            </div>
          ) : (
            <div className="w-16 h-4 bg-muted animate-pulse rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">---</span>
            </div>
          )}
        </div>

        <div className="w-24 h-12 flex-shrink-0">
          <MiniStockChart 
            symbol={item.symbol}
            className="w-full h-full"
          />
        </div>
      </div>
    );
  };

  if (!accountId) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 flex-shrink-0">
          <CardTitle className="flex items-center text-lg">
            Stock Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex-1 flex items-center justify-center">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please complete account setup to use the watchlist feature.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 flex-shrink-0">
          <CardTitle className="flex items-center text-lg">
            Stock Watchlist
            {isInitialLoading && <Loader2 className="h-4 w-4 ml-2 animate-spin text-muted-foreground" />}
            {loadingProgress && !isInitialLoading && (
              <span className="text-xs text-muted-foreground ml-2">
                ({loadingProgress.loaded}/{loadingProgress.total})
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsSearchDialogOpen(true)}
            disabled={isInitialLoading || isUpdatingWatchlist}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 flex flex-col">
          {isInitialLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : watchlistData.length === 0 && hasAttemptedLoad ? (
            <div className="p-4 flex-1 flex items-center justify-center">
              <div className="text-center py-8 px-3 border border-dashed border-muted rounded-md">
                <div className="space-y-3">
                  <Star className="h-8 w-8 mx-auto text-muted-foreground" />
                  <h3 className="text-base font-medium">Your Watchlist is Empty</h3>
                  <p className="text-muted-foreground text-sm">
                    Search a Security To Add To Watchlist
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setIsSearchDialogOpen(true)}
                    className="mt-3"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Stock
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="p-2 space-y-1">
                {watchlistData.map(renderWatchlistItem)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <StockSearchBar 
        onStockSelect={handleStockSelect} 
        accountId={accountId}
        watchlistSymbols={watchlistSymbols}
        onWatchlistChange={onWatchlistChange}
        onOptimisticAdd={onOptimisticAdd}
        externalOpen={isSearchDialogOpen}
        onExternalOpenChange={setIsSearchDialogOpen}
        showTriggerButton={false}
      />
    </>
  );
} 