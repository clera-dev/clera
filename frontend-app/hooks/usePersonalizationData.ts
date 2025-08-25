"use client";

import { useState, useEffect } from 'react';
import { PersonalizationData } from '@/lib/types/personalization';

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
    const fetchPersonalization = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/personalization');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch personalization: ${response.status}`);
        }

        const result = await response.json();
        
        // Handle the case where no personalization data exists (new user)
        if (result.success && result.data) {
          setPersonalization(result.data);
        } else {
          setPersonalization(null);
        }
        
      } catch (err) {
        console.error('Error fetching personalization:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch personalization data');
        setPersonalization(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPersonalization();
  }, []);

  return { personalization, isLoading, error };
}
