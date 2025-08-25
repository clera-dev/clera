"use client";

import { useState, useEffect } from 'react';
import { PersonalizationData } from '@/lib/types/personalization';
import { getPersonalizationData } from '@/utils/api/personalization-client';

interface PersonalizationState {
  personalization: PersonalizationData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch user personalization data including first name and risk tolerance
 * Used for personalizing investment help prompts
 */
export function usePersonalizationData(): PersonalizationState {
  const [personalization, setPersonalization] = useState<PersonalizationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPersonalization = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const data = await getPersonalizationData();
        if (!isMounted) return;
        setPersonalization(data);
      } catch (err) {
        console.error('Error fetching personalization:', err);
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch personalization data');
        setPersonalization(null);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };

    fetchPersonalization();
    return () => {
      isMounted = false;
    };
  }, []);

  return { personalization, isLoading, error };
}
