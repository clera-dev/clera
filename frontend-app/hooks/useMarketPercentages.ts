/**
 * Hook for managing market percentage calculations with background loading.
 * 
 * This hook provides an interface to the MarketDataService while maintaining
 * React patterns for state management and lifecycle.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MarketDataService } from '@/utils/services/MarketDataService';

export interface MarketPercentageState {
  percentages: Map<string, number | undefined>;
  isCalculating: boolean;
  progress: { loaded: number; total: number } | null;
}

export function useMarketPercentages(symbols: string[], options?: { forceRefresh?: boolean }): MarketPercentageState {
  const [percentages, setPercentages] = useState<Map<string, number | undefined>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Memoize the market data service to prevent recreation on every render
  // Use the singleton instance without clearing cache to respect shared caching
  const marketDataService = useMemo(() => MarketDataService.getInstance(), []);
  
  // Use ref to track symbols for which calculation has been initiated
  const calculatedSymbolsRef = useRef<Set<string>>(new Set());
  const prevSymbolsRef = useRef<string[]>([]);
  const forceRefreshRef = useRef<boolean>(false);
  
  // SECURITY: Track component mount state to prevent memory leaks
  // Async callbacks can update state after component unmounts, causing warnings
  const isMountedRef = useRef<boolean>(true);

  // Handle force refresh option
  useEffect(() => {
    if (options?.forceRefresh && !forceRefreshRef.current) {
      forceRefreshRef.current = true;
      // Clear cache only when explicitly requested and not already done
      marketDataService.clearCache();
      // Reset calculated symbols to force recalculation
      calculatedSymbolsRef.current.clear();
      // Clear current percentages to show loading state
      setPercentages(new Map());
    }
  }, [options?.forceRefresh, marketDataService]);

  const calculatePercentages = useCallback(async (symbolsToCalculate: string[]) => {
    if (symbolsToCalculate.length === 0) return;

    // SECURITY: Check if component is still mounted before updating state
    if (!isMountedRef.current) return;

    setIsCalculating(true);
    setProgress({ loaded: 0, total: symbolsToCalculate.length });

    try {
      let completedCount = 0;
      const results = new Map<string, number | undefined>();

      // Calculate percentages in parallel but update state as they complete
      const promises = symbolsToCalculate.map(async (symbol) => {
        try {
          const percentage = await marketDataService.calculateChartBasedPercentage(symbol);
          results.set(symbol, percentage);
          completedCount++;
          
          // SECURITY: Check if component is still mounted before updating state
          if (isMountedRef.current) {
            // Update progress
            setProgress({ loaded: completedCount, total: symbolsToCalculate.length });
            
            // Update percentages map with new result
            setPercentages(prev => new Map(prev).set(symbol, percentage));
          }
          
          return { symbol, percentage };
        } catch (error) {
          console.warn(`Failed to calculate percentage for ${symbol}:`, error);
          results.set(symbol, undefined);
          completedCount++;
          
          // SECURITY: Check if component is still mounted before updating state
          if (isMountedRef.current) {
            setProgress({ loaded: completedCount, total: symbolsToCalculate.length });
            setPercentages(prev => new Map(prev).set(symbol, undefined));
          }
          
          return { symbol, percentage: undefined };
        }
      });

      // Wait for all calculations to complete
      await Promise.allSettled(promises);
      
    } finally {
      // SECURITY: Check if component is still mounted before updating state
      if (isMountedRef.current) {
        setIsCalculating(false);
        setProgress(null);
      }
    }
  }, [marketDataService]);

  // Recalculate when symbols change or force refresh is requested
  useEffect(() => {
    // Check if symbols actually changed
    const symbolsChanged = 
      symbols.length !== prevSymbolsRef.current.length ||
      symbols.some((symbol, index) => symbol !== prevSymbolsRef.current[index]);

    // Check if force refresh was requested
    const forceRefreshRequested = options?.forceRefresh && forceRefreshRef.current;

    if (symbolsChanged || forceRefreshRequested) {
      prevSymbolsRef.current = symbols;
      // Reset force refresh flag when symbols change or after processing force refresh
      forceRefreshRef.current = false;
      
      if (symbols.length > 0) {
        // For force refresh, calculate all symbols. For symbol changes, only calculate new ones
        const symbolsToCalculate = forceRefreshRequested 
          ? symbols 
          : symbols.filter(symbol => !calculatedSymbolsRef.current.has(symbol));
        
        if (symbolsToCalculate.length > 0) {
          // Mark these symbols as being calculated
          symbolsToCalculate.forEach(symbol => calculatedSymbolsRef.current.add(symbol));
          calculatePercentages(symbolsToCalculate);
        }
      }
    }
  }, [symbols, options?.forceRefresh, calculatePercentages]);

  // Clean up percentages and refs for symbols that are no longer needed
  useEffect(() => {
    const symbolsSet = new Set(symbols);
    
    // Clean up calculated symbols ref
    const newCalculatedSymbols = new Set<string>();
    symbols.forEach(symbol => {
      if (calculatedSymbolsRef.current.has(symbol)) {
        newCalculatedSymbols.add(symbol);
      }
    });
    calculatedSymbolsRef.current = newCalculatedSymbols;
    
    // Clean up percentages state
    // SECURITY: Check if component is still mounted before updating state
    if (isMountedRef.current) {
      setPercentages(prev => {
        // Check if cleanup is actually needed to prevent unnecessary updates
        const needsCleanup = Array.from(prev.keys()).some(symbol => !symbolsSet.has(symbol));
        
        if (!needsCleanup) {
          return prev; // Return the same object to prevent unnecessary re-renders
        }
        
        const newMap = new Map();
        symbols.forEach(symbol => {
          if (prev.has(symbol)) {
            newMap.set(symbol, prev.get(symbol));
          }
        });
        return newMap;
      });
    }
  }, [symbols]);

  // SECURITY: Cleanup effect to prevent memory leaks from async callbacks
  useEffect(() => {
    // Set mounted flag to true when component mounts
    isMountedRef.current = true;
    
    // Cleanup function sets mounted flag to false when component unmounts
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    percentages,
    isCalculating,
    progress,
  };
} 