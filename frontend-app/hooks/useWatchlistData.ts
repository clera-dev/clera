/**
 * Custom hook for managing watchlist data orchestration, caching, and progressive loading.
 * 
 * This hook extracts the heavy domain-level data logic from the UI component
 * to maintain separation of concerns and improve testability.
 * 
 * PROGRESS TRACKING: This hook provides accurate loading progress feedback:
 * - Tracks individual item loading progress for better UX
 * - Updates progress as each quote is fetched
 * - Shows completion state before clearing progress
 * - Prevents stuck progress bars at 0%
 * 
 * LOADING STATES: This hook provides granular loading state management:
 * - isInitialLoading: True during the very first data fetch
 * - isUpdatingWatchlist: True during add/remove operations
 * - loadingProgress: Detailed progress tracking for initial loads
 * - No generic isLoading to avoid confusion with specific states
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface WatchlistItem {
  symbol: string;
  companyName?: string;
  currentPrice?: number;
  dayChange?: number;
  dayChangePercent?: number;
  logo?: string;
  isLoading?: boolean;
}

export interface WatchlistDataState {
  watchlistData: WatchlistItem[];
  isInitialLoading: boolean;
  isUpdatingWatchlist: boolean;
  hasAttemptedLoad: boolean;
  loadingProgress: { loaded: number; total: number } | null;
  error: string | null;
}

export interface WatchlistDataActions {
  fetchWatchlist: () => Promise<void>;
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  setError: (error: string | null) => void;
}

interface UseWatchlistDataProps {
  accountId: string | null;
  watchlistSymbols?: Set<string>;
  onWatchlistChange?: () => void;
  onOptimisticAdd?: (symbol: string) => void;
  onOptimisticRemove?: (symbol: string) => void;
}

export function useWatchlistData({
  accountId,
  watchlistSymbols,
  onWatchlistChange,
  onOptimisticAdd,
  onOptimisticRemove,
}: UseWatchlistDataProps): WatchlistDataState & WatchlistDataActions {
  
  const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isUpdatingWatchlist, setIsUpdatingWatchlist] = useState(false);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [loadedItemsCount, setLoadedItemsCount] = useState(0);

  // Ref to access latest watchlistData in setInterval callbacks
  const watchlistDataRef = useRef<WatchlistItem[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    watchlistDataRef.current = watchlistData;
  }, [watchlistData]);

  const handleIndividualQuoteFallback = useCallback(async (items: WatchlistItem[]) => {
    let loadedCount = 0;
    const totalItems = items.length;
    
    // Update progress for each completed item
    const updateProgress = () => {
      loadedCount++;
      setLoadingProgress({ loaded: loadedCount, total: totalItems });
    };
    
    const enhancedItems = await Promise.allSettled(
      items.map(async (item) => {
        try {
          const quoteResponse = await fetch(`/api/market/quote/${item.symbol}`);
          let currentPrice = undefined;
          
          if (quoteResponse.ok) {
            const quoteData = await quoteResponse.json();
            currentPrice = quoteData.price;
          }
          
          // Update progress when each item completes
          updateProgress();
          
          return {
            ...item,
            currentPrice: currentPrice ?? item.currentPrice,
            isLoading: false
          };
        } catch (err) {
          console.warn(`Failed to get quote for ${item.symbol}:`, err);
          
          // Update progress even for failed items
          updateProgress();
          
          return {
            ...item,
            isLoading: false
          };
        }
      })
    );
    
    const priceEnhancedItems = enhancedItems.map((result, index) => 
      result.status === 'fulfilled' ? result.value : items[index]
    );
    
    setWatchlistData(priceEnhancedItems);
    
    // Clear progress after a brief delay to show completion
    setTimeout(() => setLoadingProgress(null), 500);
  }, []);

  const fetchWatchlist = useCallback(async () => {
    if (!accountId) return;
    
    setError(null);
    setHasAttemptedLoad(true);
    
    // Only show initial loading spinner if this is the first load (no existing data)
    const isFirstLoad = watchlistData.length === 0;
    if (isFirstLoad) {
      setIsInitialLoading(true);
    }
    
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
        const existingItem = watchlistDataRef.current.find(item => item.symbol === symbol);
        return {
          ...existingItem, // Preserve all existing data (prices, logos, etc.)
          symbol,
          // Only show loading state for new items or during initial load
          isLoading: !existingItem || isFirstLoad
        };
      });
      
      setWatchlistData(basicWatchlistItems);
      setIsInitialLoading(false);
      
      // Only show progress for initial loads, not background refreshes
      if (isFirstLoad) {
        setLoadingProgress({ loaded: 0, total: basicWatchlistItems.length });
        setLoadedItemsCount(0);
      }
      
      // PHASE 2: Enhance with price data using batch API
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
            
            if (batchData.quotes && Array.isArray(batchData.quotes)) {
              batchData.quotes.forEach((quote: any) => {
                if (quote.symbol && quote.price !== undefined) {
                  quotesMap.set(quote.symbol.toUpperCase(), quote.price);
                }
              });
            }
            
            const priceEnhancedItems = basicWatchlistItems.map(item => ({
              ...item,
              currentPrice: quotesMap.get(item.symbol.toUpperCase()) ?? item.currentPrice,
              isLoading: false
            }));
            
            setWatchlistData(priceEnhancedItems);
            
            // Update progress to show all items loaded
            if (isFirstLoad) {
              setLoadingProgress({ loaded: basicWatchlistItems.length, total: basicWatchlistItems.length });
              // Clear progress after a brief delay to show completion
              setTimeout(() => setLoadingProgress(null), 500);
            } else {
              setLoadingProgress(null);
            }
          } else {
            console.warn('Batch quote API failed, falling back to individual calls');
            await handleIndividualQuoteFallback(basicWatchlistItems);
          }
        } catch (err) {
          console.warn('Batch quote API error, falling back to individual calls:', err);
          await handleIndividualQuoteFallback(basicWatchlistItems);
        }
      }
      
    } catch (err: any) {
      console.error('Error fetching watchlist:', err);
      setError(err.message || 'Failed to load watchlist');
      setIsInitialLoading(false);
    }
  }, [accountId, watchlistData.length, handleIndividualQuoteFallback]);

  const addToWatchlist = useCallback(async (symbol: string) => {
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
  }, [accountId, isUpdatingWatchlist, onOptimisticAdd, onWatchlistChange, onOptimisticRemove]);

  const removeFromWatchlist = useCallback(async (symbol: string) => {
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
  }, [accountId, isUpdatingWatchlist, onOptimisticRemove, onWatchlistChange, onOptimisticAdd]);

  // Auto-fetch and polling logic
  useEffect(() => {
    if (watchlistSymbols && accountId) {
      // Only show initial loading for the very first load when we have no data
      const isFirstLoad = watchlistData.length === 0 && !hasAttemptedLoad;
      if (isFirstLoad) {
        setIsInitialLoading(true);
      }
      
      fetchWatchlist();
      
      const interval = setInterval(() => {
        if (!isUpdatingWatchlist) {
          // Background refresh - don't show loading spinner, just update data seamlessly
          fetchWatchlist();
        }
      }, 30000);
      
      return () => clearInterval(interval);
    } else if (accountId && watchlistSymbols && watchlistData.length === 0) {
      setIsInitialLoading(true);
    }
  }, [accountId, watchlistSymbols, fetchWatchlist, isUpdatingWatchlist, watchlistData.length, hasAttemptedLoad]);

  return {
    // State
    watchlistData,
    isInitialLoading,
    isUpdatingWatchlist,
    hasAttemptedLoad,
    loadingProgress,
    error,
    // Actions
    fetchWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    setError,
  };
} 