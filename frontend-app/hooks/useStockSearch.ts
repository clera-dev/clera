/**
 * Custom hook for efficient server-side stock search with debouncing.
 * 
 * PERFORMANCE OPTIMIZATION:
 * Instead of loading all 12K+ assets upfront, this hook:
 * 1. Fetches only popular stocks initially (50 items)
 * 2. Performs server-side search when user types (debounced)
 * 3. Caches results to avoid redundant API calls
 * 
 * This reduces initial page load from ~900KB to ~5KB.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface StockSearchResult {
  symbol: string;
  name: string;
  score?: number;
}

interface UseStockSearchOptions {
  /** Debounce delay in milliseconds (default: 200ms) */
  debounceMs?: number;
  /** Maximum results to return (default: 30) */
  limit?: number;
  /** Whether to fetch popular stocks on mount (default: true) */
  fetchPopularOnMount?: boolean;
}

interface UseStockSearchReturn {
  /** Current search results */
  results: StockSearchResult[];
  /** Popular stocks for initial display */
  popularStocks: StockSearchResult[];
  /** Whether search is currently loading */
  isSearching: boolean;
  /** Whether popular stocks are loading */
  isLoadingPopular: boolean;
  /** Current search term */
  searchTerm: string;
  /** Function to update search term */
  setSearchTerm: (term: string) => void;
  /** Any error that occurred */
  error: string | null;
  /** Whether we have active search results (vs popular stocks) */
  hasSearchResults: boolean;
}

// In-memory cache for search results to avoid redundant API calls
const searchCache = new Map<string, StockSearchResult[]>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();
const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for search requests

function getCachedResults(key: string): StockSearchResult[] | null {
  const timestamp = cacheTimestamps.get(key);
  if (timestamp && Date.now() - timestamp < CACHE_TTL_MS) {
    return searchCache.get(key) || null;
  }
  // Cache expired, remove it
  searchCache.delete(key);
  cacheTimestamps.delete(key);
  return null;
}

function setCachedResults(key: string, results: StockSearchResult[]): void {
  searchCache.set(key, results);
  cacheTimestamps.set(key, Date.now());
}

export function useStockSearch(options: UseStockSearchOptions = {}): UseStockSearchReturn {
  const {
    debounceMs = 200,
    limit = 30,
    fetchPopularOnMount = true,
  } = options;

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [popularStocks, setPopularStocks] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPopular, setIsLoadingPopular] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the current search request to handle race conditions
  const searchRequestRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch popular stocks on mount
  useEffect(() => {
    if (!fetchPopularOnMount) return;

    // Use AbortController for proper cleanup on unmount (React Strict Mode compatibility)
    const abortController = new AbortController();

    const fetchPopular = async () => {
      // Check cache first
      const cached = getCachedResults('__popular__');
      if (cached) {
        setPopularStocks(cached);
        return;
      }

      setIsLoadingPopular(true);
      setError(null);
      try {
        const response = await fetch('/api/market/popular?limit=50', {
          signal: abortController.signal,
        });
        
        // Don't proceed if aborted during fetch
        if (abortController.signal.aborted) return;
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error || `Server error (${response.status})`;
          throw new Error(errorMsg);
        }
        const data = await response.json();
        const stocks = data.assets || [];
        
        // Don't update state if aborted
        if (abortController.signal.aborted) return;
        
        // Detect when backend returns empty data (usually means tradable_assets.json wasn't loaded)
        if (stocks.length === 0) {
          console.warn('Popular stocks returned empty - backend may have asset loading issues');
          setError('Unable to load stocks. Please try again later.');
        }
        
        setPopularStocks(stocks);
        setCachedResults('__popular__', stocks);
      } catch (err: any) {
        // Ignore abort errors from cleanup - these are expected in React Strict Mode
        if (err?.name === 'AbortError') return;
        
        console.error('Error fetching popular stocks:', err);
        setError(err?.message || 'Failed to load popular stocks');
      } finally {
        // Only update loading state if not aborted
        if (!abortController.signal.aborted) {
          setIsLoadingPopular(false);
        }
      }
    };

    fetchPopular();
    
    // Cleanup: abort fetch if component unmounts
    return () => {
      abortController.abort();
    };
  }, [fetchPopularOnMount]);

  // Perform server-side search
  const performSearch = useCallback(async (term: string) => {
    const trimmedTerm = term.trim();
    
    if (!trimmedTerm) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Check cache first
    const cacheKey = `search:${trimmedTerm.toLowerCase()}:${limit}`;
    const cached = getCachedResults(cacheKey);
    if (cached) {
      setResults(cached);
      setIsSearching(false);
      return;
    }

    // Track this request
    const requestId = ++searchRequestRef.current;
    setIsSearching(true);
    setError(null);

    // Create timeout for search request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/market/search?q=${encodeURIComponent(trimmedTerm)}&limit=${limit}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      // Check if this is still the current request
      if (requestId !== searchRequestRef.current) {
        return; // Ignore stale response
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      const searchResults = data.results || [];
      
      setResults(searchResults);
      setCachedResults(cacheKey, searchResults);
    } catch (err: any) {
      clearTimeout(timeoutId);
      // Only set error if this is still the current request
      if (requestId === searchRequestRef.current) {
        // Provide specific error message for timeout
        const message = err?.name === 'AbortError'
          ? 'Search timed out. Please try again.'
          : err?.message || 'Failed to search stocks';
        console.error('Stock search error:', err);
        setError(message);
        setResults([]);
      }
    } finally {
      // Only update loading state if this is still the current request
      if (requestId === searchRequestRef.current) {
        setIsSearching(false);
      }
    }
  }, [limit]);

  // Debounced search effect
  useEffect(() => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If empty search term, clear results immediately and invalidate in-flight requests
    if (!searchTerm.trim()) {
      // Increment requestRef to invalidate any in-flight search requests
      // This prevents stale responses from repopulating results after user cleared input
      searchRequestRef.current++;
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Set searching state immediately for UI feedback
    setIsSearching(true);

    // Debounce the actual API call
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchTerm);
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, debounceMs, performSearch]);

  // Determine if we have active search results
  const hasSearchResults = useMemo(() => {
    return searchTerm.trim().length > 0;
  }, [searchTerm]);

  return {
    results,
    popularStocks,
    isSearching,
    isLoadingPopular,
    searchTerm,
    setSearchTerm,
    error,
    hasSearchResults,
  };
}

/**
 * Utility function to clear the search cache.
 * Useful for testing or when assets are refreshed.
 */
export function clearStockSearchCache(): void {
  searchCache.clear();
  cacheTimestamps.clear();
}
