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
    let timeoutId: NodeJS.Timeout | null = null;
    
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
        // Don't log temporary network errors
        console.warn('[useAccountClosure] Temporary error fetching closure data (will retry)');
        setError(null); // Don't show error for temporary issues
        setClosureData(null);
        
        // Retry once after a short delay for temporary server issues
        timeoutId = setTimeout(async () => {
          try {
            const retryData = await accountClosureService.fetchClosureData();
            setClosureData(retryData);
          } catch (retryErr) {
            // Silent fail on retry
          }
        }, 2000);
      } finally {
        setLoading(false);
      }
    };

    fetchClosureDataWrapper();
    
    // Cleanup function to clear timeout if component unmounts
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
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
      // Don't log temporary network errors
      console.warn('[useAccountClosure] Temporary error refetching closure data (will retry)');
      setError(null); // Don't show error for temporary issues
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