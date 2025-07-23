"use client";

import { useState, useEffect } from 'react';
import { accountClosureService, ClosureData, ClosureState } from '@/utils/services/accountClosureService';
import { createClient } from '@/utils/supabase/client';

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

  useEffect(() => {
    const fetchClosureDataWrapper = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        const data = await accountClosureService.fetchClosureData();
        setClosureData(data);
        
      } catch (err) {
        console.error('[useAccountClosure] Error fetching closure data:', err);
        setError('Failed to load closure data');
        setClosureData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchClosureDataWrapper();
  }, []);

  const refetch = async (): Promise<void> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const data = await accountClosureService.fetchClosureData();
      setClosureData(data);
      
    } catch (err) {
      console.error('[useAccountClosure] Error refetching closure data:', err);
      setError('Failed to load closure data');
      setClosureData(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    closureData,
    loading,
    error,
    refetch
  };
} 