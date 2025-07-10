import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface UserOnboardingStatus {
  status: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook to fetch and manage user onboarding status
 * Abstracts Supabase access logic from UI components
 */
export function useUserOnboardingStatus(): UserOnboardingStatus {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserStatus = async () => {
      try {
        setError(null);
        const supabase = createClient();
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          throw new Error(`Failed to get user: ${userError.message}`);
        }
        
        if (!user) {
          setStatus(null);
          return;
        }

        const { data: onboardingData, error: onboardingError } = await supabase
          .from('user_onboarding')
          .select('status')
          .eq('user_id', user.id)
          .single();
        
        if (onboardingError && onboardingError.code !== 'PGRST116') {
          // PGRST116 is "not found" error, which is expected for new users
          throw new Error(`Failed to fetch onboarding status: ${onboardingError.message}`);
        }
        
        setStatus(onboardingData?.status || null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        console.error('Error fetching user onboarding status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserStatus();
  }, []);

  return {
    status,
    isLoading,
    error
  };
} 