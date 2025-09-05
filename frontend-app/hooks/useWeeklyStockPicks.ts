import { useState, useEffect } from 'react';
import { WeeklyStockPicksData, WeeklyStockPicksResponse } from '@/lib/types/weekly-stock-picks';

interface UseWeeklyStockPicksReturn {
  data: WeeklyStockPicksData | null;
  isLoading: boolean;
  error: string | null;
  lastGenerated: string | null;
  weekOf: string | null;
  isFallback: boolean;
  isNewUser: boolean; // No data generated yet
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching personalized weekly stock picks
 * Handles loading states, errors, and fallback data gracefully
 */
export function useWeeklyStockPicks(): UseWeeklyStockPicksReturn {
  const [data, setData] = useState<WeeklyStockPicksData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/investment/weekly-picks', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const responseData: WeeklyStockPicksResponse = await response.json();
      
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch weekly stock picks');
      }

      // Handle different response states
      if (responseData.data) {
        // User has data - existing user
        setData(responseData.data);
        setLastGenerated(responseData.metadata?.generated_at || null);
        setWeekOf(responseData.metadata?.week_of || null);
        setIsFallback(!!responseData.metadata?.fallback_reason);
        setIsNewUser(false);
      } else if (responseData.metadata?.fallback_reason === 'generation_in_progress') {
        // New user or in-progress generation - no data generated yet
        setData(null);
        setLastGenerated(null);
        setWeekOf(responseData.metadata?.week_of || null);
        setIsFallback(false);
        setIsNewUser(true);
      } else {
        // Other case - handle as error
        throw new Error('No data available');
      }
    } catch (error) {
      console.error('Error fetching weekly stock picks:', error);
      setError(error instanceof Error ? error.message : 'Failed to load weekly stock picks');
      // Don't set data to null here - let the API handle fallback data
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    data,
    isLoading,
    error,
    lastGenerated,
    weekOf,
    isFallback,
    isNewUser,
    refetch: fetchData,
  };
}
