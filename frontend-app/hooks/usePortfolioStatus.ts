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
    if (!accountId) {
      setIsLoading(false);
      setIsEmpty(null);
      return;
    }

    const checkPortfolioStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio/positions?accountId=${accountId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch portfolio: ${response.status}`);
        }

        const data = await response.json();
        
        // Portfolio is empty if no positions or only cash positions
        const hasPositions = data?.positions?.some((pos: any) => 
          pos.symbol !== 'USD' && 
          pos.symbol !== '$CASH' &&
          parseFloat(pos.market_value || 0) > 0
        );
        
        setIsEmpty(!hasPositions);
        
      } catch (err) {
        console.error('Error checking portfolio status:', err);
        setError(err instanceof Error ? err.message : 'Failed to check portfolio status');
        setIsEmpty(null); // Unknown state on error
      } finally {
        setIsLoading(false);
      }
    };

    checkPortfolioStatus();
  }, [accountId]);

  return { isEmpty, isLoading, error };
}
