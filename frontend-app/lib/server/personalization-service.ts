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
 * @returns PersonalizationData if found, null if no data exists
 * @throws Error for database errors (caller should handle appropriately)
 */
export async function fetchUserPersonalization(
  userId: string, 
  supabase: any
): Promise<PersonalizationData | null> {
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
      throw new Error(`Failed to fetch personalization data: ${error.message}`);
    }

    // Convert database format to application format
    if (personalizationData) {
      return formatPersonalizationFromDatabase(personalizationData);
    }

    return null;
    
  } catch (error) {
    // Re-throw database errors for proper error handling by caller
    if (error instanceof Error) {
      throw error;
    }
    
    console.error(`Unexpected error fetching personalization for user ${userId}:`, error);
    throw new Error('Unexpected error occurred while fetching personalization data');
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
    monthlyInvestmentGoal: record.monthly_investment_goal ?? 250,
    marketInterests: record.market_interests || [],
  };
}

/**
 * Checks if a user has any personalization data
 * 
 * @param userId - The Supabase user ID to check
 * @param supabase - Authenticated Supabase client instance
 * @returns boolean indicating if personalization data exists
 */
export async function hasUserPersonalization(
  userId: string,
  supabase: any
): Promise<boolean> {
  try {
    const data = await fetchUserPersonalization(userId, supabase);
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
