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
 * 
 * RACE CONDITION PROTECTION: This hook prevents overlapping fetchWatchlist calls:
 * - Uses AbortController to cancel previous requests when new ones start
 * - Tracks request sequence to ignore stale responses
 * - Ensures only the most recent request's response is processed
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

  // Ref to access latest watchlistData in setInterval callbacks
  const watchlistDataRef = useRef<WatchlistItem[]>([]);
  
  // Race condition protection: track current request and abort controller
  const currentRequestRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef<number>(0);
  
  // Keep ref in sync with state
  useEffect(() => {
    watchlistDataRef.current = watchlistData;
  }, [watchlistData]);

  const handleIndividualQuoteFallback = useCallback(async (items: WatchlistItem[], requestId: number) => {
    // Check if this request is still current
    if (requestId !== requestSequenceRef.current) {
      return; // Ignore stale request
    }
    
    let loadedCount = 0;
    const totalItems = items.length;
    
    // Update progress for each completed item
    const updateProgress = () => {
      // Check if this request is still current before updating state
      if (requestId !== requestSequenceRef.current) {
        return;
      }
      loadedCount++;
      setLoadingProgress({ loaded: loadedCount, total: totalItems });
    };
    
    const enhancedItems = await Promise.allSettled(
      items.map(async (item) => {
        try {
          // Check if request was aborted before each individual call
          if (requestId !== requestSequenceRef.current) {
            throw new Error('Request aborted');
          }
          
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
    
    // Final check before updating state
    if (requestId !== requestSequenceRef.current) {
      return; // Ignore stale request
    }
    
    const priceEnhancedItems = enhancedItems.map((result, index) => 
      result.status === 'fulfilled' ? result.value : items[index]
    );
    
    setWatchlistData(priceEnhancedItems);
    
    // Clear progress after a brief delay to show completion
    setTimeout(() => {
      if (requestId === requestSequenceRef.current) {
        setLoadingProgress(null);
      }
    }, 500);
  }, []);

  const fetchWatchlist = useCallback(async () => {
    if (!accountId) return;
    
    // Cancel any existing request
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }
    
    // Create new abort controller and increment request sequence
    const abortController = new AbortController();
    currentRequestRef.current = abortController;
    const requestId = ++requestSequenceRef.current;
    
    setError(null);
    setHasAttemptedLoad(true);
    
    // Only show initial loading spinner if this is the first load (no existing data)
    const isFirstLoad = watchlistDataRef.current.length === 0;
    if (isFirstLoad) {
      setIsInitialLoading(true);
    }
    
    try {
      const response = await fetch(`/api/watchlist/${accountId}`, {
        signal: abortController.signal
      });
      
      // Check if this request is still current
      if (requestId !== requestSequenceRef.current) {
        return; // Ignore stale response
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch watchlist');
      }
      
      const result = await response.json();
      
      // Check again before processing response
      if (requestId !== requestSequenceRef.current) {
        return; // Ignore stale response
      }
      
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
      }
      
      // PHASE 2: Enhance with price data using batch API
      if (basicWatchlistItems.length > 0) {
        try {
          // Check if request was aborted before batch call
          if (requestId !== requestSequenceRef.current) {
            return; // Ignore stale request
          }
          
          const batchQuoteResponse = await fetch('/api/market/quotes/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              symbols: basicWatchlistItems.map(item => item.symbol)
            }),
            signal: abortController.signal
          });
          
          // Check if this request is still current
          if (requestId !== requestSequenceRef.current) {
            return; // Ignore stale response
          }
          
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
            
            // Final check before updating state
            if (requestId !== requestSequenceRef.current) {
              return; // Ignore stale response
            }
            
            setWatchlistData(priceEnhancedItems);
            
            // Update progress to show all items loaded
            if (isFirstLoad) {
              setLoadingProgress({ loaded: basicWatchlistItems.length, total: basicWatchlistItems.length });
              // Clear progress after a brief delay to show completion
              setTimeout(() => {
                if (requestId === requestSequenceRef.current) {
                  setLoadingProgress(null);
                }
              }, 500);
            } else {
              setLoadingProgress(null);
            }
          } else {
            console.warn('Batch quote API failed, falling back to individual calls');
            await handleIndividualQuoteFallback(basicWatchlistItems, requestId);
          }
        } catch (err) {
          // Check if this was an abort error
          if (err instanceof Error && err.name === 'AbortError') {
            return; // Request was aborted, ignore
          }
          
          console.warn('Batch quote API error, falling back to individual calls:', err);
          await handleIndividualQuoteFallback(basicWatchlistItems, requestId);
        }
      }
      
    } catch (err: any) {
      // Check if this was an abort error
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Request was aborted, ignore
      }
      
      // Only update error state if this is still the current request
      if (requestId === requestSequenceRef.current) {
        console.error('Error fetching watchlist:', err);
        setError(err.message || 'Failed to load watchlist');
        setIsInitialLoading(false);
      }
    } finally {
      // Clean up abort controller if this was the current request
      if (currentRequestRef.current === abortController) {
        currentRequestRef.current = null;
      }
    }
  }, [accountId, handleIndividualQuoteFallback]);

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
        // Only start a new request if we're not currently updating the watchlist
        // and there's no active fetch request
        if (!isUpdatingWatchlist && !currentRequestRef.current) {
          // Background refresh - don't show loading spinner, just update data seamlessly
          fetchWatchlist();
        }
      }, 30000);
      
      return () => {
        clearInterval(interval);
        // Cancel any pending request when component unmounts
        if (currentRequestRef.current) {
          currentRequestRef.current.abort();
        }
      };
    } else if (accountId && watchlistSymbols && watchlistData.length === 0) {
      setIsInitialLoading(true);
    }
  }, [accountId, watchlistSymbols, fetchWatchlist, isUpdatingWatchlist, hasAttemptedLoad]);

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