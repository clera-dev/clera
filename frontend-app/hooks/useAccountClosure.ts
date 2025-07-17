"use client";

import { useState, useEffect } from 'react';
import { accountClosureService, ClosureData, ClosureState } from '@/utils/services/accountClosureService';

export interface UseAccountClosureReturn {
  closureData: ClosureData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Re-export ClosureState for use in components
export type { ClosureState } from '@/utils/services/accountClosureService';

/**
 * Custom hook for managing account closure data
 * Handles fetching and caching of closure information
 */
export function useAccountClosure(): UseAccountClosureReturn {
  const [closureData, setClosureData] = useState<ClosureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClosureData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await accountClosureService.fetchClosureData();
      setClosureData(data);
      
      // CRITICAL FIX: Don't set error when data is null
      // null now indicates "no closure activity" (normal state), not an error
      // The service will return null for users without closure activity
      
    } catch (err) {
      console.error('[useAccountClosure] Error fetching closure data:', err);
      setError('Failed to load closure data');
      setClosureData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClosureData();
  }, []);

  return {
    closureData,
    loading,
    error,
    refetch: fetchClosureData
  };
} 