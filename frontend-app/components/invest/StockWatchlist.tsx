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
  isLoading?: boolean; // New field for progressive loading
}

interface ProcessedDataItem {
  timestamp: number;
  price: number;
  utcDate: Date;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // Separate state for initial load
  const [error, setError] = useState<string | null>(null);
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false); // Track if we've attempted to load data
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Performance optimization: Cache for chart-based percentage calculations
  const percentageCache = useMemo(() => new Map<string, { value: number; timestamp: number }>(), []);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  // Get company profiles for logo display
  const symbols = watchlistData.map(item => item.symbol);
  const { profiles, getProfile } = useCompanyProfiles(symbols);

  // Optimized chart-based percentage calculation with caching
  const calculateChartBasedPercentage = async (symbol: string): Promise<number | undefined> => {
    // Check cache first
    const cached = percentageCache.get(symbol);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.value;
    }

    try {
      const now = new Date();
      const { default: MarketHolidayUtil } = await import("@/lib/marketHolidays");
      const latestTradingDay = MarketHolidayUtil.getLastTradingDay(now);
      const daysSinceLastTradingDay = (now.getTime() - latestTradingDay.getTime()) / (1000 * 60 * 60 * 24);
      const isUnreasonableFutureDate = daysSinceLastTradingDay > 7;

      let toDate: Date;
      let fromDate: Date;
      let easternToday: Date = new Date();
      let isMarketClosed = false;

      if (isUnreasonableFutureDate) {
        easternToday = new Date(latestTradingDay);
        isMarketClosed = true;
        fromDate = new Date(latestTradingDay);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(latestTradingDay);
        toDate.setHours(23, 59, 59, 999);
      } else {
        const easternHour = parseInt(now.toLocaleString("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          hour12: false
        }));
        
        const easternMinute = parseInt(now.toLocaleString("en-US", {
          timeZone: "America/New_York", 
          minute: "2-digit"
        }));
        
        const easternParts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(now);
        
        const easternYear = parseInt(easternParts.find(part => part.type === 'year')?.value || '0');
        const easternMonth = parseInt(easternParts.find(part => part.type === 'month')?.value || '0');
        const easternDay = parseInt(easternParts.find(part => part.type === 'day')?.value || '0');
        
        const marketDate = new Date(easternYear, easternMonth - 1, easternDay);
        const isValidTradingDay = MarketHolidayUtil.isMarketOpen(marketDate);
        const isPreMarket = easternHour < 9 || (easternHour === 9 && easternMinute < 30);
        
        let chartDate: Date;
        
        if (isPreMarket || !isValidTradingDay) {
          chartDate = MarketHolidayUtil.getLastTradingDay(marketDate, isValidTradingDay ? 1 : 0);
          isMarketClosed = true;
        } else {
          chartDate = new Date(marketDate);
          chartDate.setHours(0, 0, 0, 0);
          isMarketClosed = false;
        }
        
        fromDate = new Date(chartDate);
        fromDate.setHours(0, 0, 0, 0);
        
        toDate = new Date(chartDate);
        toDate.setHours(23, 59, 59, 999);
        
        easternToday = chartDate;
      }
      
      const formatDateSafe = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const fromStr = formatDateSafe(fromDate);
      const toStr = formatDateSafe(toDate);
      
      const response = await fetch(`/api/fmp/chart/${symbol}?interval=5min&from=${fromStr}&to=${toStr}`);
      
      if (!response.ok) {
        return undefined;
      }
      
      const rawData = await response.json();

      if (!rawData || !Array.isArray(rawData)) {
        return undefined;
      }
      
      const { parseFMPEasternTimestamp } = await import("@/lib/timezone");
      
      const processedData = rawData
        .map((item: any): ProcessedDataItem | null => {
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
        .filter((item): item is ProcessedDataItem => item !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (processedData.length > 0) {
        const mostRecentDate = processedData[processedData.length - 1].utcDate;
        const mostRecentTradingDay = new Date(mostRecentDate);
        mostRecentTradingDay.setUTCHours(0, 0, 0, 0);
        
        const singleDayData = processedData.filter((item) => {
          const itemDate = new Date(item.utcDate);
          itemDate.setUTCHours(0, 0, 0, 0);
          return itemDate.getTime() === mostRecentTradingDay.getTime();
        });
        
        if (singleDayData.length >= 2) {
          const openingPrice = singleDayData[0].price;
          const closingPrice = singleDayData[singleDayData.length - 1].price;

          if (openingPrice === 0) {
            return undefined;
          }

          const changePercent = ((closingPrice - openingPrice) / openingPrice) * 100;
          
          // Cache the result
          percentageCache.set(symbol, { value: changePercent, timestamp: Date.now() });
          
          return changePercent;
        }
      }
      
      return undefined;
    } catch (error) {
      return undefined;
    }
  };

  // Optimized fetch function with progressive loading and batch API calls
  const fetchWatchlist = async () => {
    if (!accountId) return;
    
    setError(null);
    setHasAttemptedLoad(true);
    setIsInitialLoading(true); // Ensure loading spinner shows
    
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
      
      // PHASE 1: Show basic watchlist structure immediately, preserving existing data
      const basicWatchlistItems: WatchlistItem[] = result.symbols.map((symbol: string) => {
        // Try to preserve existing item data
        const existingItem = watchlistData.find(item => item.symbol === symbol);
        return {
          ...existingItem, // Preserve existing data (company name, logo, etc.)
          symbol,
          isLoading: true // Mark as loading for progressive enhancement
        };
      });
      
      setWatchlistData(basicWatchlistItems);
      setIsInitialLoading(false);
      setLoadingProgress({ loaded: 0, total: basicWatchlistItems.length });
      
      // PHASE 2: Enhance with price data using batch API (much faster)
      if (basicWatchlistItems.length > 0) {
        try {
          const batchQuoteResponse = await fetch('/api/market/quotes/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              symbols: basicWatchlistItems.map(item => item.symbol)
            })
          });
          
          if (batchQuoteResponse.ok) {
            const batchData = await batchQuoteResponse.json();
            const quotesMap = new Map();
            
            // Create a map of symbol to quote data for fast lookup
            if (batchData.quotes && Array.isArray(batchData.quotes)) {
              batchData.quotes.forEach((quote: any) => {
                if (quote.symbol && quote.price !== undefined) {
                  quotesMap.set(quote.symbol.toUpperCase(), quote.price);
                }
              });
            }
            
            // Update items with price data, preserving existing data
            const priceEnhancedItems = basicWatchlistItems.map(item => ({
              ...item,
              currentPrice: quotesMap.get(item.symbol.toUpperCase()) ?? item.currentPrice,
              isLoading: false
            }));
            
            setWatchlistData(priceEnhancedItems);
            
            // PHASE 3: Enhance with percentage data (background, non-blocking)
            let completedCount = 0;
            const percentagePromises = priceEnhancedItems.map(async (item, index) => {
              try {
                const chartBasedPercent = await calculateChartBasedPercentage(item.symbol);
                completedCount++;
                setLoadingProgress({ loaded: completedCount, total: priceEnhancedItems.length });
                return {
                  ...item,
                  dayChangePercent: chartBasedPercent
                };
              } catch (err) {
                console.warn(`Failed to get percentage for ${item.symbol}:`, err);
                completedCount++;
                setLoadingProgress({ loaded: completedCount, total: priceEnhancedItems.length });
                return item;
              }
            });
            
            // Update percentages as they complete (non-blocking)
            Promise.allSettled(percentagePromises).then((results) => {
              const finalItems = results.map((result, index) => 
                result.status === 'fulfilled' ? result.value : priceEnhancedItems[index]
              );
              setWatchlistData(finalItems);
              setLoadingProgress(null); // Clear progress when done
            });
          } else {
            // Fallback to individual API calls if batch fails
            console.warn('Batch quote API failed, falling back to individual calls');
            const enhancedItems = await Promise.allSettled(
              basicWatchlistItems.map(async (item) => {
                try {
                  const quoteResponse = await fetch(`/api/market/quote/${item.symbol}`);
                  let currentPrice = undefined;
                  
                  if (quoteResponse.ok) {
                    const quoteData = await quoteResponse.json();
                    currentPrice = quoteData.price;
                  }
                  
                  return {
                    ...item,
                    currentPrice: currentPrice ?? item.currentPrice,
                    isLoading: false
                  };
                } catch (err) {
                  console.warn(`Failed to get quote for ${item.symbol}:`, err);
                  return {
                    ...item,
                    isLoading: false
                  };
                }
              })
            );
            
            const priceEnhancedItems = enhancedItems.map((result, index) => 
              result.status === 'fulfilled' ? result.value : basicWatchlistItems[index]
            );
            
            setWatchlistData(priceEnhancedItems);
          }
        } catch (err) {
          console.warn('Batch quote API error, falling back to individual calls:', err);
          // Fallback to individual calls
          const enhancedItems = await Promise.allSettled(
            basicWatchlistItems.map(async (item) => {
              try {
                const quoteResponse = await fetch(`/api/market/quote/${item.symbol}`);
                let currentPrice = undefined;
                
                if (quoteResponse.ok) {
                  const quoteData = await quoteResponse.json();
                  currentPrice = quoteData.price;
                }
                
                return {
                  ...item,
                  currentPrice: currentPrice ?? item.currentPrice,
                  isLoading: false
                };
              } catch (err) {
                console.warn(`Failed to get quote for ${item.symbol}:`, err);
                return {
                  ...item,
                  isLoading: false
                };
              }
            })
          );
          
          const priceEnhancedItems = enhancedItems.map((result, index) => 
            result.status === 'fulfilled' ? result.value : basicWatchlistItems[index]
          );
          
          setWatchlistData(priceEnhancedItems);
        }
      }
      
    } catch (err: any) {
      console.error('Error fetching watchlist:', err);
      setError(err.message || 'Failed to load watchlist');
      setIsInitialLoading(false);
    }
  };

  // Update watchlist data when external watchlist symbols change
  useEffect(() => {
    if (watchlistSymbols && accountId) {
      const updateWatchlistFromSymbols = async () => {
        const symbolsArray = Array.from(watchlistSymbols);
        
        // Only show initial loading if we have no data at all
        if (watchlistData.length === 0 && symbolsArray.length > 0) {
          setIsInitialLoading(true);
        }
        
        if (symbolsArray.length === 0) {
          setWatchlistData([]);
          setIsInitialLoading(false);
          return;
        }
        
        try {
          // Use batch API for better performance
          const batchQuoteResponse = await fetch('/api/market/quotes/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbols: symbolsArray })
          });
          
          const quotesMap = new Map();
          
          if (batchQuoteResponse.ok) {
            const batchData = await batchQuoteResponse.json();
            if (batchData.quotes && Array.isArray(batchData.quotes)) {
              batchData.quotes.forEach((quote: any) => {
                if (quote.symbol && quote.price !== undefined) {
                  quotesMap.set(quote.symbol.toUpperCase(), quote.price);
                }
              });
            }
          }
          
          // Create basic items with price data, preserving existing data when possible
          const basicItems: WatchlistItem[] = symbolsArray.map(symbol => {
            // Try to preserve existing item data
            const existingItem = watchlistData.find(item => item.symbol === symbol);
            return {
              ...existingItem, // Preserve existing data (company name, logo, etc.)
              symbol,
              currentPrice: quotesMap.get(symbol.toUpperCase()) ?? existingItem?.currentPrice
            };
          });
          
          // Only update if we have data to show (smooth transition)
          if (basicItems.length > 0) {
            setWatchlistData(basicItems);
            setIsInitialLoading(false);
          }
          
          // Enhance with percentage data in background (non-blocking)
          const enhancedItems = await Promise.allSettled(
            basicItems.map(async (item) => {
              try {
                const chartBasedPercent = await calculateChartBasedPercentage(item.symbol);
                return {
                  ...item,
                  dayChangePercent: chartBasedPercent
                };
              } catch (err) {
                console.warn(`Failed to get percentage for ${item.symbol}:`, err);
                return item;
              }
            })
          );
          
          const finalItems = enhancedItems.map((result, index) => 
            result.status === 'fulfilled' ? result.value : basicItems[index]
          );
          
          // Update with enhanced data (smooth transition)
          setWatchlistData(finalItems);
          
        } catch (err) {
          console.warn('Batch API failed, falling back to individual calls:', err);
          
          // Fallback to individual calls
          const watchlistItems: WatchlistItem[] = await Promise.allSettled(
            symbolsArray.map(async (symbol: string) => {
              try {
                // Try to preserve existing item data
                const existingItem = watchlistData.find(item => item.symbol === symbol);
                
                const quoteResponse = await fetch(`/api/market/quote/${symbol}`);
                let currentPrice = existingItem?.currentPrice; // Preserve existing price
                
                if (quoteResponse.ok) {
                  const quoteData = await quoteResponse.json();
                  currentPrice = quoteData.price;
                }
                
                const chartBasedPercent = await calculateChartBasedPercentage(symbol);
                
                return {
                  ...existingItem, // Preserve existing data
                  symbol,
                  currentPrice,
                  dayChangePercent: chartBasedPercent
                };
              } catch (err) {
                console.warn(`Failed to get data for ${symbol}:`, err);
                // Preserve existing item if available
                const existingItem = watchlistData.find(item => item.symbol === symbol);
                return existingItem || { symbol };
              }
            })
          ).then(results => 
            results.map(result => 
              result.status === 'fulfilled' ? result.value : { symbol: 'UNKNOWN' }
            )
          );
          
          setWatchlistData(watchlistItems);
          setIsInitialLoading(false);
        }
      };
      
      updateWatchlistFromSymbols();
      
      const interval = setInterval(async () => {
        if (!isUpdatingWatchlist && !isRefreshing) {
          setIsRefreshing(true);
          await updateWatchlistFromSymbols();
          setIsRefreshing(false);
        }
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [watchlistSymbols, accountId]);

  const addToWatchlist = async (symbol: string) => {
    if (!accountId || isUpdatingWatchlist) return;

    setIsUpdatingWatchlist(true);
    
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

      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      setError(`Failed to add ${symbol} to watchlist`);
      
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

      if (onWatchlistChange) {
        onWatchlistChange();
      }
      
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      setError(`Failed to remove ${symbol} from watchlist`);
      
      if (onOptimisticAdd) {
        onOptimisticAdd(symbol);
      }
    } finally {
      setIsUpdatingWatchlist(false);
    }
  };

  const handleStockSelect = async (symbol: string) => {
    setIsSearchDialogOpen(false);
    await addToWatchlist(symbol);
  };

  const handleWatchlistItemClick = (symbol: string) => {
    if (onStockSelect) {
      onStockSelect(symbol);
    }
  };

  useEffect(() => {
    if (accountId && !watchlistSymbols) {
      // Ensure loading state is set when starting to fetch
      setIsInitialLoading(true);
      fetchWatchlist();
      
      const interval = setInterval(() => {
        if (!isUpdatingWatchlist) {
          fetchWatchlist();
        }
      }, 30000);
      
      return () => clearInterval(interval);
    } else if (accountId && watchlistSymbols && watchlistData.length === 0) {
      // If we have symbols but no data, show loading
      setIsInitialLoading(true);
    }
  }, [accountId, watchlistSymbols]);

  const renderWatchlistItem = (item: WatchlistItem) => {
    const profile = getProfile(item.symbol);
    const dayChangePercent = item.dayChangePercent || 0;
    
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
          ) : item.dayChangePercent !== undefined ? (
            <div className={`text-sm font-semibold ${getReturnColor(dayChangePercent)}`}>
              {formatReturnPercent(dayChangePercent)}
            </div>
          ) : (
            <div className="w-16 h-4 bg-muted animate-pulse rounded flex items-center justify-center">
              <span className="text-xs text-muted-foreground">...</span>
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
            {(isInitialLoading || isRefreshing) && <Loader2 className="h-4 w-4 ml-2 animate-spin text-muted-foreground" />}
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