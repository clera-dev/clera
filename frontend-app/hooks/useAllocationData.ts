/**
 * Production-Grade Data Prefetching Hook for Portfolio Allocations
 * 
 * This hook implements smart caching and parallel prefetching to eliminate
 * loading delays when switching between asset class and sector views.
 * 
 * Features:
 * - Parallel data fetching for both allocation types
 * - Smart caching with composite keys (accountId + filterAccount)
 * - Optimistic UI updates (show cached data while fetching)
 * - Automatic cache invalidation on account/filter changes
 * - Debounced fetching to prevent rapid successive requests
 * 
 * @author Clera Engineering Team
 * @since 2025-01-23
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SectorAllocationEntry {
  sector: string;
  value: number;
  percentage: number;
}

export interface SectorAllocationData {
  sectors: SectorAllocationEntry[];
  total_portfolio_value: number;
  last_data_update_timestamp?: string;
}

export interface CashStockBondAllocationItem {
  name: string;
  value: number;
  rawValue: number;
  category: 'cash' | 'stock' | 'bond';
}

export interface AssetClassAllocationData {
  pie_data?: CashStockBondAllocationItem[];
  cash?: { value: number; percentage: number };
  stock?: { value: number; percentage: number };
  bond?: { value: number; percentage: number };
}

export interface AllocationDataState {
  assetClass: {
    data: CashStockBondAllocationItem[] | null;
    loading: boolean;
    error: string | null;
    lastFetched: number | null;
  };
  sector: {
    data: SectorAllocationData | null;
    loading: boolean;
    error: string | null;
    lastFetched: number | null;
  };
}

interface UseAllocationDataParams {
  accountId: string | null;
  selectedAccountFilter?: string;
  userId?: string;
  enabled?: boolean; // Allow disabling the hook
  cacheTTL?: number; // Cache time-to-live in milliseconds (default: 5 minutes)
}

// ============================================================================
// Cache Implementation
// ============================================================================

/**
 * Simple in-memory cache for allocation data.
 * Uses composite keys to store data per account/filter combination.
 */
class AllocationCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  /**
   * Generate a unique cache key from parameters
   */
  private getCacheKey(
    type: 'assetClass' | 'sector',
    accountId: string | null,
    filterAccount: string | undefined
  ): string {
    return `${type}:${accountId || 'null'}:${filterAccount || 'total'}`;
  }

  /**
   * Get cached data if it exists and is not expired
   */
  get(
    type: 'assetClass' | 'sector',
    accountId: string | null,
    filterAccount: string | undefined,
    ttl: number
  ): any | null {
    const key = this.getCacheKey(type, accountId, filterAccount);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const isExpired = Date.now() - cached.timestamp > ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Store data in cache with current timestamp
   */
  set(
    type: 'assetClass' | 'sector',
    accountId: string | null,
    filterAccount: string | undefined,
    data: any
  ): void {
    const key = this.getCacheKey(type, accountId, filterAccount);
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for specific account/filter combination
   */
  clearFor(accountId: string | null, filterAccount: string | undefined): void {
    const assetClassKey = this.getCacheKey('assetClass', accountId, filterAccount);
    const sectorKey = this.getCacheKey('sector', accountId, filterAccount);
    this.cache.delete(assetClassKey);
    this.cache.delete(sectorKey);
  }
}

// Singleton cache instance shared across all component instances
const globalCache = new AllocationCache();

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAllocationData({
  accountId,
  selectedAccountFilter = 'total',
  userId,
  enabled = true,
  cacheTTL = 5 * 60 * 1000, // 5 minutes default
}: UseAllocationDataParams) {
  // State for both allocation types
  const [state, setState] = useState<AllocationDataState>({
    assetClass: {
      data: null,
      loading: false,
      error: null,
      lastFetched: null,
    },
    sector: {
      data: null,
      loading: false,
      error: null,
      lastFetched: null,
    },
  });

  // Track the current fetch parameters to prevent race conditions
  const currentFetchRef = useRef<{
    accountId: string | null;
    filterAccount: string;
  } | null>(null);

  // Debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch asset class allocation data
   */
  const fetchAssetClassData = useCallback(async (
    targetAccountId: string | null,
    targetFilter: string
  ): Promise<CashStockBondAllocationItem[] | null> => {
    try {
      const filterParam = (targetFilter && targetFilter !== 'total')
        ? `&filter_account=${targetFilter}`
        : '';
      const url = `/api/portfolio/cash-stock-bond-allocation?accountId=${targetAccountId || 'null'}${filterParam}`;
      
      console.log(`📊 [useAllocationData] Fetching asset class data for filter: ${targetFilter}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch allocation data' }));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      // Handle both API formats
      const pieData = data.pie_data || [
        { name: 'Cash', value: data.cash?.value || 0, percentage: data.cash?.percentage || 0, category: 'cash' as const, rawValue: data.cash?.value || 0 },
        { name: 'Stock', value: data.stock?.value || 0, percentage: data.stock?.percentage || 0, category: 'stock' as const, rawValue: data.stock?.value || 0 },
        { name: 'Bond', value: data.bond?.value || 0, percentage: data.bond?.percentage || 0, category: 'bond' as const, rawValue: data.bond?.value || 0 }
      ].filter(item => item.value > 0);
      
      return pieData;
    } catch (error: any) {
      console.error('[useAllocationData] Asset class fetch error:', error);
      throw error;
    }
  }, []);

  /**
   * Fetch sector allocation data
   */
  const fetchSectorData = useCallback(async (
    targetAccountId: string | null,
    targetFilter: string
  ): Promise<SectorAllocationData | null> => {
    try {
      const filterParam = (targetFilter && targetFilter !== 'total')
        ? `&filter_account=${targetFilter}`
        : '';
      const url = `/api/portfolio/sector-allocation?account_id=${targetAccountId || 'null'}${filterParam}`;
      
      console.log(`📊 [useAllocationData] Fetching sector data for filter: ${targetFilter}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch sector data' }));
        throw new Error(errorData.detail || `HTTP error ${response.status}`);
      }
      
      const data: SectorAllocationData = await response.json();
      return data;
    } catch (error: any) {
      console.error('[useAllocationData] Sector fetch error:', error);
      throw error;
    }
  }, []);

  /**
   * Fetch both allocation types in parallel
   * Uses smart caching to avoid unnecessary network requests
   */
  const fetchAllData = useCallback(async (
    targetAccountId: string | null,
    targetFilter: string,
    forceRefresh: boolean = false
  ) => {
    // Prevent race conditions
    currentFetchRef.current = {
      accountId: targetAccountId,
      filterAccount: targetFilter,
    };

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedAssetClass = globalCache.get('assetClass', targetAccountId, targetFilter, cacheTTL);
      const cachedSector = globalCache.get('sector', targetAccountId, targetFilter, cacheTTL);
      
      if (cachedAssetClass && cachedSector) {
        console.log('✅ [useAllocationData] Using cached data');
        setState({
          assetClass: {
            data: cachedAssetClass,
            loading: false,
            error: null,
            lastFetched: Date.now(),
          },
          sector: {
            data: cachedSector,
            loading: false,
            error: null,
            lastFetched: Date.now(),
          },
        });
        return;
      }
    }

    // Set loading state
    setState(prev => ({
      assetClass: { ...prev.assetClass, loading: true, error: null },
      sector: { ...prev.sector, loading: true, error: null },
    }));

    try {
      // Fetch both in parallel for maximum performance
      const [assetClassResult, sectorResult] = await Promise.allSettled([
        fetchAssetClassData(targetAccountId, targetFilter),
        fetchSectorData(targetAccountId, targetFilter),
      ]);

      // Check if this fetch is still relevant (prevent race conditions)
      if (
        currentFetchRef.current?.accountId !== targetAccountId ||
        currentFetchRef.current?.filterAccount !== targetFilter
      ) {
        console.log('⚠️ [useAllocationData] Fetch result discarded (stale)');
        return;
      }

      // Process asset class result
      let assetClassData: CashStockBondAllocationItem[] | null = null;
      let assetClassError: string | null = null;
      
      if (assetClassResult.status === 'fulfilled') {
        assetClassData = assetClassResult.value;
        globalCache.set('assetClass', targetAccountId, targetFilter, assetClassData);
      } else {
        assetClassError = assetClassResult.reason?.message || 'Failed to load asset class data';
      }

      // Process sector result
      let sectorData: SectorAllocationData | null = null;
      let sectorError: string | null = null;
      
      if (sectorResult.status === 'fulfilled') {
        sectorData = sectorResult.value;
        globalCache.set('sector', targetAccountId, targetFilter, sectorData);
      } else {
        sectorError = sectorResult.reason?.message || 'Failed to load sector data';
      }

      // Update state with results
      setState({
        assetClass: {
          data: assetClassData,
          loading: false,
          error: assetClassError,
          lastFetched: Date.now(),
        },
        sector: {
          data: sectorData,
          loading: false,
          error: sectorError,
          lastFetched: Date.now(),
        },
      });

      console.log('✅ [useAllocationData] Data fetched and cached successfully');
    } catch (error: any) {
      console.error('[useAllocationData] Unexpected error:', error);
      
      setState({
        assetClass: {
          data: null,
          loading: false,
          error: error.message || 'Unexpected error loading data',
          lastFetched: null,
        },
        sector: {
          data: null,
          loading: false,
          error: error.message || 'Unexpected error loading data',
          lastFetched: null,
        },
      });
    }
  }, [fetchAssetClassData, fetchSectorData, cacheTTL]);

  /**
   * Debounced fetch to prevent rapid successive requests
   */
  const debouncedFetch = useCallback((
    targetAccountId: string | null,
    targetFilter: string,
    forceRefresh: boolean = false
  ) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      fetchAllData(targetAccountId, targetFilter, forceRefresh);
    }, 100); // 100ms debounce
  }, [fetchAllData]);

  /**
   * Public method to force refresh data
   */
  const refresh = useCallback(() => {
    if (!enabled) return;
    console.log('🔄 [useAllocationData] Manual refresh triggered');
    fetchAllData(accountId, selectedAccountFilter, true);
  }, [enabled, accountId, selectedAccountFilter, fetchAllData]);

  /**
   * Effect: Fetch data when parameters change
   */
  useEffect(() => {
    if (!enabled) {
      console.log('⏸️ [useAllocationData] Hook disabled, skipping fetch');
      return;
    }

    console.log('🚀 [useAllocationData] Parameters changed, fetching data...');
    debouncedFetch(accountId, selectedAccountFilter, false);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, accountId, selectedAccountFilter, userId, debouncedFetch]);

  return {
    assetClassData: state.assetClass.data,
    assetClassLoading: state.assetClass.loading,
    assetClassError: state.assetClass.error,
    
    sectorData: state.sector.data,
    sectorLoading: state.sector.loading,
    sectorError: state.sector.error,
    
    isLoading: state.assetClass.loading || state.sector.loading,
    hasData: !!(state.assetClass.data || state.sector.data),
    
    refresh,
  };
}

