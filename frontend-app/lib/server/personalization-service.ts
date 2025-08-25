/**
 * Server-side personalization service for API routes
 * Provides centralized access to user personalization data from Supabase
 * 
 * This service is designed for server-side use in Next.js API routes where
 * direct Supabase client access is available and HTTP client calls would
 * not inherit authentication context.
 */

import { PersonalizationData } from '@/lib/types/personalization';

/**
 * Fetches personalization data for a specific user using direct Supabase access
 * 
 * @param userId - The Supabase user ID to fetch personalization data for
 * @param supabase - Authenticated Supabase client instance
 * @param options - Configuration options for error handling behavior
 * @returns PersonalizationData if found, null if no data exists
 * @throws Error for database errors when throwOnError is true (default behavior for API routes)
 */
export async function fetchUserPersonalization(
  userId: string, 
  supabase: any,
  options: { throwOnError?: boolean } = {}
): Promise<PersonalizationData | null> {
  const { throwOnError = true } = options;
  if (!userId) {
    console.warn('Empty userId provided to fetchUserPersonalization');
    return null;
  }

  if (!supabase) {
    throw new Error('Supabase client is required');
  }

  try {
    const { data: personalizationData, error } = await supabase
      .from('user_personalization')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No personalization data found - this is not an error condition
        console.log(`No personalization data found for user ${userId}`);
        return null;
      }
      
      // Log actual errors for debugging
      console.error(`Database error fetching personalization for user ${userId}:`, error);
      
      if (throwOnError) {
        throw new Error(`Failed to fetch personalization data: ${error.message}`);
      } else {
        // Graceful degradation for cron jobs - return null and continue processing
        console.warn(`Gracefully handling personalization fetch error for user ${userId}, continuing with defaults`);
        return null;
      }
    }

    // Convert database format to application format
    if (personalizationData) {
      return formatPersonalizationFromDatabase(personalizationData);
    }

    return null;
    
  } catch (error) {
    console.error(`Unexpected error fetching personalization for user ${userId}:`, error);
    
    if (throwOnError) {
      // Re-throw database errors for proper error handling by caller (API routes)
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unexpected error occurred while fetching personalization data');
    } else {
      // Graceful degradation for cron jobs - return null and continue processing
      console.warn(`Gracefully handling unexpected personalization error for user ${userId}, continuing with defaults`);
      return null;
    }
  }
}

/**
 * Formats raw database personalization record to application PersonalizationData format
 * 
 * @param record - Raw database record from user_personalization table
 * @returns Formatted PersonalizationData object
 */
function formatPersonalizationFromDatabase(record: any): PersonalizationData {
  return {
    firstName: record.first_name || '',
    investmentGoals: record.investment_goals || [],
    riskTolerance: record.risk_tolerance,
    investmentTimeline: record.investment_timeline,
    experienceLevel: record.experience_level,
    monthlyInvestmentGoal: record.monthly_investment_goal, // Database handles default with DEFAULT 250
    marketInterests: record.market_interests || [],
  };
}

/**
 * Checks if a user has any personalization data
 * 
 * @param userId - The Supabase user ID to check
 * @param supabase - Authenticated Supabase client instance
 * @param options - Configuration options for error handling behavior
 * @returns boolean indicating if personalization data exists
 */
export async function hasUserPersonalization(
  userId: string,
  supabase: any,
  options: { throwOnError?: boolean } = {}
): Promise<boolean> {
  try {
    const data = await fetchUserPersonalization(userId, supabase, options);
    return data !== null;
  } catch (error) {
    console.error(`Error checking personalization existence for user ${userId}:`, error);
    return false;
  }
}

/**
 * Type guard to check if personalization data is complete enough for AI processing
 * 
 * @param data - PersonalizationData to validate
 * @returns boolean indicating if data has minimum required fields
 */
export function isPersonalizationDataComplete(data: PersonalizationData | null): boolean {
  if (!data) return false;
  
  return !!(
    data.riskTolerance &&
    data.investmentTimeline &&
    data.experienceLevel &&
    data.investmentGoals?.length > 0
  );
}
