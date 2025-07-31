/**
 * Hook for managing MarketDataService cache with proper singleton pattern respect.
 * 
 * This hook provides controlled cache invalidation without interfering with
 * the shared singleton cache used by other components.
 */

import { useCallback, useMemo } from 'react';
import { MarketDataService } from '@/utils/services/MarketDataService';

export interface MarketDataCacheControls {
  clearCache: () => void;
  getCacheStats: () => { size: number; entries: string[] };
  invalidateSymbol: (symbol: string) => void;
}

/**
 * Hook for managing MarketDataService cache operations
 * 
 * @returns Cache control functions that respect the singleton pattern
 */
export function useMarketDataCache(): MarketDataCacheControls {
  // Get the singleton instance without clearing cache
  const marketDataService = useMemo(() => MarketDataService.getInstance(), []);

  /**
   * Clear the entire cache - use sparingly
   * This affects ALL components using the MarketDataService
   */
  const clearCache = useCallback(() => {
    console.log('[MarketDataCache] Clearing entire cache - this affects all components');
    marketDataService.clearCache();
  }, [marketDataService]);

  /**
   * Get cache statistics for debugging
   */
  const getCacheStats = useCallback(() => {
    return marketDataService.getCacheStats();
  }, [marketDataService]);

  /**
   * Invalidate a specific symbol from cache
   * This is more targeted than clearing the entire cache
   */
  const invalidateSymbol = useCallback((symbol: string) => {
    console.log(`[MarketDataCache] Invalidating symbol: ${symbol}`);
    marketDataService.invalidateSymbol(symbol);
  }, [marketDataService]);

  return {
    clearCache,
    getCacheStats,
    invalidateSymbol,
  };
}

/**
 * Hook for forcing a refresh of market data calculations
 * 
 * @param symbols - Array of symbols to refresh
 * @returns Function to trigger refresh and current refresh state
 */
export function useMarketDataRefresh(symbols: string[]) {
  const { clearCache } = useMarketDataCache();
  
  const forceRefresh = useCallback(() => {
    console.log(`[MarketDataRefresh] Force refreshing ${symbols.length} symbols`);
    clearCache();
  }, [clearCache, symbols]);

  return {
    forceRefresh,
  };
} 