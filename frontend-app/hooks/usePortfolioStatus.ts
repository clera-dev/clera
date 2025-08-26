"use client";

import { useState, useEffect } from 'react';

interface PortfolioStatusState {
  isEmpty: boolean | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to detect if user's portfolio is empty (only cash, no positions)
 * Used to trigger investment help popup for new users
 */
export function usePortfolioStatus(accountId: string | null): PortfolioStatusState {
  const [isEmpty, setIsEmpty] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    if (!accountId) {
      if (isMounted) {
        setIsLoading(false);
        setIsEmpty(null);
      }
      return () => {
        isMounted = false;
        abortController.abort();
      };
    }

    const checkPortfolioStatus = async () => {
      try {
        if (!isMounted) return;
        setIsLoading(true);
        setError(null);

        let response: Response;
        let data: any;

        try {
          response = await fetch(
            `/api/portfolio/positions?accountId=${encodeURIComponent(accountId)}`,
            { signal: abortController.signal }
          );
        } catch (fetchError) {
          // Handle network errors (but not HTTP errors like 404)
          if (abortController.signal.aborted) return;
          throw fetchError;
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch portfolio: ${response.status}`);
        }

        data = await response.json();

        // Normalize positions shape: API may return an array or an object with `positions`
        const positions: any[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.positions)
            ? (data as any).positions
            : [];

        // If we couldn't determine shape, treat as unknown instead of misclassifying
        if (!isMounted) return;
        if (!Array.isArray(positions)) {
          setIsEmpty(null);
          return;
        }

        // Portfolio is empty if no positions or only cash-equivalent entries
        const hasNonCashPosition = positions.some((pos: any) => {
          const symbol = String(pos?.symbol || pos?.asset_symbol || '').toUpperCase();
          const marketValue = Number(pos?.market_value ?? pos?.marketValue ?? pos?.current_market_value ?? 0);
          const isCash = symbol === 'USD' || symbol === '$CASH';
          return !isCash && marketValue > 0;
        });

        setIsEmpty(positions.length === 0 ? true : !hasNonCashPosition);
        
      } catch (err) {
        if (abortController.signal.aborted) return; // Ignore aborted fetch
        console.error('Error checking portfolio status:', err);
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to check portfolio status');
        setIsEmpty(null); // Unknown state on error
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };

    checkPortfolioStatus();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [accountId]);

  return { isEmpty, isLoading, error };
}
