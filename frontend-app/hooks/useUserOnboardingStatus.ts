import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface UserOnboardingStatus {
  status: string | null;
  isLoading: boolean;
  error: string | null;
}

interface UseUserOnboardingStatusOptions {
  skipAuthCheck?: boolean; // Skip auth check entirely (useful for auth pages)
}

/**
 * Custom hook to fetch and manage user onboarding status
 * Abstracts Supabase access logic from UI components
 * Gracefully handles missing auth sessions (e.g., on auth pages)
 */
export function useUserOnboardingStatus(options: UseUserOnboardingStatusOptions = {}): UserOnboardingStatus {
  const { skipAuthCheck = false } = options;
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!skipAuthCheck); // Start as not loading if skipping auth check
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If skipping auth check, don't make any API calls
    if (skipAuthCheck) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    // Set loading to true when we start making API calls
    setIsLoading(true);

    const fetchUserStatus = async () => {
      try {
        setError(null);
        const supabase = createClient();
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          // Handle auth errors gracefully - this is expected on auth pages
          if (userError.message.includes('Auth session missing') || 
              userError.message.includes('Invalid JWT') ||
              userError.message.includes('JWT expired')) {
            // This is not an error, it just means the user is not logged in
            setStatus(null);
            setIsLoading(false);
            return;
          }
          // For other auth errors, still throw them
          throw new Error(`Failed to get user: ${userError.message}`);
        }
        
        if (!user) {
          // This is not an error, it just means the user is not logged in.
          // The hook should not throw an error in this case.
          setStatus(null);
          setIsLoading(false);
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
  }, [skipAuthCheck]);

  return {
    status,
    isLoading,
    error
  };
} 