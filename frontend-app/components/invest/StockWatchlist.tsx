'use client'

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, TrendingUp, TrendingDown, Minus, Star, AlertCircle, Loader2 } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

import StockSearchBar from "./StockSearchBar";
import MiniStockChart from "./MiniStockChart";
import { useCompanyProfiles } from "@/hooks/useCompanyProfile";
import { formatCurrency } from "@/lib/utils";

interface WatchlistItem {
  symbol: string;
  companyName?: string;
  currentPrice?: number;
  dayChange?: number;
  dayChangePercent?: number;
  logo?: string;
}

interface StockWatchlistProps {
  accountId: string | null;
  onStockSelect?: (symbol: string) => void;
  watchlistSymbols?: Set<string>;
  onWatchlistChange?: () => void;
  onOptimisticAdd?: (symbol: string) => void;
  onOptimisticRemove?: (symbol: string) => void;
}

export default function StockWatchlist({ accountId, onStockSelect, watchlistSymbols, onWatchlistChange, onOptimisticAdd, onOptimisticRemove }: StockWatchlistProps) {
  const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);

  // Get company profiles for logo display
  const symbols = watchlistData.map(item => item.symbol);
  const { profiles, getProfile } = useCompanyProfiles(symbols);

  // Helper function to calculate 1D percentage from chart data (same as MiniStockChart)
  const calculateChartBasedPercentage = async (symbol: string): Promise<number | undefined> => {
    console.log(`[Watchlist] Starting chart-based calculation for ${symbol}`);
    
    try {
      // Use the same date logic as MiniStockChart
      const now = new Date();
      let toDate: Date;
      let fromDate: Date;
      
      // Check if markets are currently closed using proper Eastern Time
      const easternFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const easternParts = easternFormatter.formatToParts(now);
      const easternHour = parseInt(easternParts.find(part => part.type === 'hour')?.value || '0');
      const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
      const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
      const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
      
      const easternToday = new Date(easternYear, easternMonth - 1, easternDay);
      const easternDayOfWeek = easternToday.getDay();
      
      const isAfterHours = easternHour >= 16 || easternHour < 9;
      const isWeekend = easternDayOfWeek === 0 || easternDayOfWeek === 6;
      const isMarketClosed = isAfterHours || isWeekend;
      
      console.log(`[Watchlist ${symbol}] Market status: closed=${isMarketClosed}, hour=${easternHour}`);
      
      if (isMarketClosed) {
        // If markets are closed, use the most recent trading day
        const { default: MarketHolidayUtil } = await import("@/lib/marketHolidays");
        const mostRecentTradingDay = MarketHolidayUtil.getLastTradingDay(easternToday);
        
        // FIXED: Show ONLY the most recent trading day for proper 1D calculation  
        // This ensures consistency with StockChart 1D calculation
        fromDate = new Date(mostRecentTradingDay);
        fromDate.setHours(0, 0, 0, 0); // Start of the trading day
        
        toDate = new Date(mostRecentTradingDay);
        toDate.setHours(23, 59, 59, 999); // End of the same trading day
      } else {
        // Markets are open - get current trading day data
        const { getStartOfTodayInUserTimezone } = await import("@/lib/timezone");
        const startOfToday = getStartOfTodayInUserTimezone();
        fromDate = startOfToday;
        toDate = now;
      }
      
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
      
      console.log(`[Watchlist ${symbol}] Fetching chart data from ${fromStr} to ${toStr}`);
      
      // Try to get chart data
      const response = await fetch(`/api/fmp/chart/${symbol}?interval=5min&from=${fromStr}&to=${toStr}`);
      
      if (!response.ok) {
        console.warn(`[Watchlist ${symbol}] Chart API failed with status ${response.status}`);
        return undefined;
      }
      
      const rawData = await response.json();
      
      if (!rawData || rawData.length === 0) {
        console.warn(`[Watchlist ${symbol}] No chart data received`);
        return undefined;
      }
      
      console.log(`[Watchlist ${symbol}] Received ${rawData.length} raw data points`);
      
      // Process the data to calculate 1D percentage
      const { parseFMPEasternTimestamp } = await import("@/lib/timezone");
      
      const processedData = rawData
        .map((item: any) => {
          const fmpTimestamp = item.date || item.datetime || item.timestamp;
          if (!fmpTimestamp) return null;
          
          try {
            const utcDate = parseFMPEasternTimestamp(fmpTimestamp);
            if (utcDate > now) return null;
            
            const price = item.price !== undefined ? item.price : item.close || 0;
            
            return {
              timestamp: utcDate.getTime(),
              price,
              utcDate
            };
          } catch (error) {
            return null;
          }
        })
        .filter((item: any) => item !== null)
        .sort((a: any, b: any) => a.timestamp - b.timestamp);
      
      console.log(`[Watchlist ${symbol}] Processed ${processedData.length} data points after filtering`);
      
      // Filter for only the most recent trading day to get true 1D percentage
      if (processedData.length > 0) {
        // Get the most recent trading day
        const mostRecentDate = processedData[processedData.length - 1].utcDate;
        const mostRecentTradingDay = new Date(mostRecentDate);
        mostRecentTradingDay.setUTCHours(0, 0, 0, 0); // Start of day in UTC
        
        // Filter data for only the most recent trading day
        const singleDayData = processedData.filter((item: any) => {
          const itemDate = new Date(item.utcDate);
          itemDate.setUTCHours(0, 0, 0, 0);
          return itemDate.getTime() === mostRecentTradingDay.getTime();
        });
        
        console.log(`[Watchlist ${symbol}] Filtered to ${singleDayData.length} data points for most recent trading day`);
        
        if (singleDayData.length >= 2) {
          const openingPrice = singleDayData[0].price; // First data point of the day
          const closingPrice = singleDayData[singleDayData.length - 1].price; // Last data point of the day
          const changePercent = ((closingPrice - openingPrice) / openingPrice) * 100;
          
          console.log(`[Watchlist ${symbol}] Single-day calculation: ${openingPrice} -> ${closingPrice} = ${changePercent.toFixed(2)}%`);
          
          return changePercent;
        }
      }
      
      console.warn(`[Watchlist ${symbol}] Insufficient data for single-day percentage calculation`);
      return undefined;
    } catch (error) {
      console.error(`[Watchlist] Failed to calculate chart-based percentage for ${symbol}:`, error);
      return undefined;
    }
  };

  // Fetch watchlist data
  const fetchWatchlist = async () => {
    if (!accountId) return;
    
    // Only show loading on initial load, not on refreshes
    if (watchlistData.length === 0) {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      const response = await fetch(`/api/watchlist/${accountId}`, {
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch watchlist');
      }
      
      const result = await response.json();
      
      // Get latest quotes for each symbol using chart-based calculation
      const watchlistItems: WatchlistItem[] = await Promise.all(
        result.symbols.map(async (symbol: string) => {
          try {
            // Get current price from quote API (for price display)
            const quoteResponse = await fetch(`/api/market/quote/${symbol}`);
            let currentPrice = undefined;
            
            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              currentPrice = quoteData.price;
            }
            
                          // Get 1D percentage from chart data (for consistency with main chart)
              const chartBasedPercent = await calculateChartBasedPercentage(symbol);
              
              console.log(`[Watchlist] Final percentage for ${symbol}: ${chartBasedPercent}`);
              
              return {
                symbol,
                currentPrice,
                dayChangePercent: chartBasedPercent
              };
          } catch (err) {
            console.warn(`Failed to get data for ${symbol}:`, err);
            return { symbol };
          }
        })
      );
      
      setWatchlistData(watchlistItems);
    } catch (err: any) {
      console.error('Error fetching watchlist:', err);
      // Only show error if we don't have existing data
      if (watchlistData.length === 0) {
        setError(err.message || 'Failed to load watchlist');
      }
    } finally {
      // Only turn off loading if we were actually loading
      if (watchlistData.length === 0) {
        setIsLoading(false);
      }
    }
  };

  // Update watchlist data when external watchlist symbols change
  useEffect(() => {
    if (watchlistSymbols && accountId) {
      // Convert Set to WatchlistItem array and fetch prices
      const updateWatchlistFromSymbols = async () => {
        console.log(`[Watchlist] updateWatchlistFromSymbols called with symbols:`, Array.from(watchlistSymbols));
        
        // Only show loading on initial load, not on refreshes
        if (watchlistData.length === 0) {
          setIsLoading(true);
        }
        
        const watchlistItems: WatchlistItem[] = await Promise.all(
          Array.from(watchlistSymbols).map(async (symbol: string) => {
            try {
              // Get current price from quote API (for price display)
              const quoteResponse = await fetch(`/api/market/quote/${symbol}`);
              let currentPrice = undefined;
              let quoteData = null;
              
              if (quoteResponse.ok) {
                quoteData = await quoteResponse.json();
                currentPrice = quoteData.price;
              }
              
              // Get 1D percentage from chart data (for consistency with main chart)
              const chartBasedPercent = await calculateChartBasedPercentage(symbol);
              
              console.log(`[Watchlist] Final percentage for ${symbol}: ${chartBasedPercent}`);
              
              // If chart-based calculation failed, try to get percentage from quote API as fallback
              let finalPercentage = chartBasedPercent;
              if (chartBasedPercent === undefined && quoteData) {
                finalPercentage = quoteData.changesPercentage;
                console.log(`[Watchlist] Using quote API fallback for ${symbol}: ${finalPercentage}%`);
              }
              
              return {
                symbol,
                currentPrice,
                dayChangePercent: finalPercentage
              };
            } catch (err) {
              console.warn(`Failed to get data for ${symbol}:`, err);
              return { symbol };
            }
          })
        );
        
        setWatchlistData(watchlistItems);
        // Only turn off loading if we were actually loading
        if (watchlistData.length === 0) {
          setIsLoading(false);
        }
      };
      
      updateWatchlistFromSymbols();
      
      // Set up periodic updates for external watchlist symbols
      const interval = setInterval(() => {
        if (!isUpdatingWatchlist) {
          updateWatchlistFromSymbols();
        }
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [watchlistSymbols, accountId]);

  const addToWatchlist = async (symbol: string) => {
    if (!accountId || isUpdatingWatchlist) return;

    setIsUpdatingWatchlist(true);
    
    // IMMEDIATE UI UPDATE: Add to external state first for instant feedback
    if (onOptimisticAdd) {
      onOptimisticAdd(symbol);
    }

    try {
      const response = await fetch(`/api/watchlist/${accountId}/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to add ${symbol} to watchlist`);
      }

      // Refresh data after successful API call (this is now for data consistency, not UI feedback)
      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      setError(`Failed to add ${symbol} to watchlist`);
      
      // ROLLBACK: If API failed, remove symbol from optimistic state
      if (onOptimisticRemove) {
        onOptimisticRemove(symbol);
      }
    } finally {
      setIsUpdatingWatchlist(false);
    }
  };

  const removeFromWatchlist = async (symbol: string) => {
    if (!accountId || isUpdatingWatchlist) return;

    setIsUpdatingWatchlist(true);
    
    // IMMEDIATE UI UPDATE: Remove from external state first for instant feedback
    if (onOptimisticRemove) {
      onOptimisticRemove(symbol);
    }

    try {
      const response = await fetch(`/api/watchlist/${accountId}/remove`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to remove ${symbol} from watchlist`);
      }

      // Refresh data after successful API call
      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      setError(`Failed to remove ${symbol} from watchlist`);
      
      // ROLLBACK: If API failed, add symbol back to optimistic state
      if (onOptimisticAdd) {
        onOptimisticAdd(symbol);
      }
    } finally {
      setIsUpdatingWatchlist(false);
    }
  };

  // Handle stock selection from search
  const handleStockSelect = async (symbol: string) => {
    setIsSearchDialogOpen(false);
    await addToWatchlist(symbol);
  };

  // Handle watchlist item click
  const handleWatchlistItemClick = (symbol: string) => {
    if (onStockSelect) {
      onStockSelect(symbol);
    }
  };

  useEffect(() => {
    // Only use fetchWatchlist if watchlistSymbols is NOT provided (i.e., component is managing its own state)
    if (accountId && !watchlistSymbols) {
      fetchWatchlist();
      
      // Set up periodic updates every 30 seconds for real-time price data
      const interval = setInterval(() => {
        if (!isUpdatingWatchlist) {
          fetchWatchlist();
        }
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [accountId, watchlistSymbols]);

  const renderWatchlistItem = (item: WatchlistItem) => {
    const profile = getProfile(item.symbol);
    const dayChangePercent = item.dayChangePercent || 0;
    
    // Color coding for 1D return percentage
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
        className="flex items-center p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
        onClick={() => handleWatchlistItemClick(item.symbol)}
      >
        {/* Left side: Logo and Symbol/Company info */}
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
        
        {/* Center: 1D Return Percentage - positioned to avoid scroll bar */}
        <div className="flex items-center justify-center w-20 flex-shrink-0 mr-3">
          {item.dayChangePercent !== undefined ? (
            <div className={`text-sm font-semibold ${getReturnColor(dayChangePercent)}`}>
              {formatReturnPercent(dayChangePercent)}
            </div>
          ) : (
            <div className="w-16 h-4 bg-muted animate-pulse rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">...</span>
            </div>
          )}
        </div>

        {/* Right side: Mini Chart */}
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
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsSearchDialogOpen(true)}
            disabled={isLoading || isUpdatingWatchlist}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 flex flex-col">
          {isLoading ? (
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
          ) : watchlistData.length === 0 ? (
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

      {/* Stock Search Dialog */}
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