"use client";

import { useState, useEffect, useRef } from 'react';
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
  
  // Use refs to track cleanup and prevent memory leaks
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();
    
    const fetchClosureDataWrapper = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }
      
      try {
        if (isMountedRef.current) {
          setLoading(true);
          setError(null);
        }
        
        const data = await accountClosureService.fetchClosureData();
        
        if (isMountedRef.current) {
          setClosureData(data);
        }
        
      } catch (err) {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) return;
        
        // Store the original error for potential retry failure
        const originalError = err instanceof Error ? err.message : 'Failed to load closure data';
        
        // Don't show error immediately - try retry first
        console.warn('[useAccountClosure] Temporary error fetching closure data (will retry):', originalError);
        setClosureData(null);
        
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        // Retry once after a short delay for temporary server issues
        timeoutRef.current = setTimeout(async () => {
          // Check if component is still mounted before retry
          if (!isMountedRef.current) return;
          
          try {
            const retryData = await accountClosureService.fetchClosureData();
            
            if (isMountedRef.current) {
              setClosureData(retryData);
              setError(null); // Clear error on successful retry
            }
          } catch (retryErr) {
            // Retry failed - now show the error to the user
            if (isMountedRef.current) {
              const retryError = retryErr instanceof Error ? retryErr.message : 'Failed to load closure data';
              console.error('[useAccountClosure] Retry failed, showing error to user:', retryError);
              setError(`Failed to load closure data. Please try again later. (${retryError})`);
            }
          }
        }, 2000);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchClosureDataWrapper();
    
    // Cleanup function to clear timeout and abort controller if component unmounts
    return () => {
      isMountedRef.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const refetch = async (): Promise<void> => {
    // Check if component is still mounted
    if (!isMountedRef.current) return;
    
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    try {
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }
      
      const data = await accountClosureService.fetchClosureData();
      
      if (isMountedRef.current) {
        setClosureData(data);
      }
      
    } catch (err) {
      // Check if component is still mounted before updating state
      if (!isMountedRef.current) return;
      
      // Show error immediately for manual refetch attempts
      const errorMessage = err instanceof Error ? err.message : 'Failed to load closure data';
      console.error('[useAccountClosure] Error refetching closure data:', errorMessage);
      setError(`Failed to load closure data. Please try again later. (${errorMessage})`);
      setClosureData(null);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return {
    closureData,
    loading,
    error,
    refetch
  };
} 