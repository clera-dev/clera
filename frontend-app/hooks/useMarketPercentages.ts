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

export function useMarketPercentages(symbols: string[]): MarketPercentageState {
  const [percentages, setPercentages] = useState<Map<string, number | undefined>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  // Memoize the market data service to prevent recreation on every render
  // Clear cache to ensure we use the latest calculation logic
  const marketDataService = useMemo(() => MarketDataService.getInstance(true), []);
  
  // Use ref to track symbols for which calculation has been initiated
  const calculatedSymbolsRef = useRef<Set<string>>(new Set());
  const prevSymbolsRef = useRef<string[]>([]);

  const calculatePercentages = useCallback(async (symbolsToCalculate: string[]) => {
    if (symbolsToCalculate.length === 0) return;

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
          
          // Update progress
          setProgress({ loaded: completedCount, total: symbolsToCalculate.length });
          
          // Update percentages map with new result
          setPercentages(prev => new Map(prev).set(symbol, percentage));
          
          return { symbol, percentage };
        } catch (error) {
          console.warn(`Failed to calculate percentage for ${symbol}:`, error);
          results.set(symbol, undefined);
          completedCount++;
          setProgress({ loaded: completedCount, total: symbolsToCalculate.length });
          setPercentages(prev => new Map(prev).set(symbol, undefined));
          return { symbol, percentage: undefined };
        }
      });

      // Wait for all calculations to complete
      await Promise.allSettled(promises);
      
    } finally {
      setIsCalculating(false);
      setProgress(null);
    }
  }, [marketDataService]);

  // Recalculate when symbols change
  useEffect(() => {
    // Check if symbols actually changed
    const symbolsChanged = 
      symbols.length !== prevSymbolsRef.current.length ||
      symbols.some((symbol, index) => symbol !== prevSymbolsRef.current[index]);

    if (symbolsChanged) {
      prevSymbolsRef.current = symbols;
      
      if (symbols.length > 0) {
        // Only calculate for symbols we haven't initiated calculation for
        const symbolsToCalculate = symbols.filter(symbol => !calculatedSymbolsRef.current.has(symbol));
        
        if (symbolsToCalculate.length > 0) {
          // Mark these symbols as being calculated
          symbolsToCalculate.forEach(symbol => calculatedSymbolsRef.current.add(symbol));
          calculatePercentages(symbolsToCalculate);
        }
      }
    }
  }, [symbols, calculatePercentages]);

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
  }, [symbols]);

  return {
    percentages,
    isCalculating,
    progress,
  };
} 