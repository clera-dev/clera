import { createClient } from '@/utils/supabase/client';
import { DAILY_QUERY_LIMIT } from '@/lib/constants';
import { getNextMidnightInTimezoneUTC } from '@/lib/timezone';

/**
 * Service for managing daily query limits with real-time checking.
 * Follows SOLID principles for maintainability and testability.
 */
export class QueryLimitService {
  private supabase = createClient();

  /**
   * Checks if a user has reached their daily query limit.
   * Performs real-time database query for accurate limit enforcement.
   * 
   * @param userId - The user's UUID
   * @returns Promise<boolean> - true if limit is reached, false otherwise
   */
  async isLimitReached(userId: string): Promise<boolean> {
    if (!userId) {
      console.error('QueryLimitService: userId is required for limit check');
      throw new Error('User ID is required for limit check');
    }

    try {
      const currentCount = await this.getCurrentQueryCount(userId);
      return currentCount >= DAILY_QUERY_LIMIT;
    } catch (error) {
      console.error('QueryLimitService: Error checking limit:', error);
      // Fail-safe: if we can't check the limit, assume it's reached to prevent abuse
      return true;
    }
  }

  /**
   * Gets the current daily query count for a user.
   * Uses the same RPC function as the existing system for consistency.
   * 
   * @param userId - The user's UUID
   * @returns Promise<number> - The current query count for today
   */
  async getCurrentQueryCount(userId: string): Promise<number> {
    if (!userId) {
      throw new Error('User ID is required to fetch query count');
    }

    const { data, error } = await this.supabase.rpc('get_user_query_count_today_pst', {
      p_user_id: userId,
    });

    if (error) {
      console.error('QueryLimitService: Error fetching query count:', error);
      throw error;
    }

    return data ?? 0;
  }

  /**
   * Records a user query in the database.
   * Should only be called AFTER a query is successfully processed.
   * 
   * @param userId - The user's UUID
   * @returns Promise<void>
   */
  async recordQuery(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to record query');
    }

    const { error } = await this.supabase.rpc('record_user_query', {
      p_user_id: userId,
    });

    if (error) {
      console.error('QueryLimitService: Error recording query:', error);
      throw error;
    }

    console.log(`QueryLimitService: Recorded query for user ${userId}`);
  }

  /**
   * Calculates the next reset time for daily query limits.
   * Resets at midnight Pacific Time (America/Los_Angeles), DST-aware.
   * 
   * @returns string - The next reset time in UTC format
   */
  getNextResetTime(): string {
    const PACIFIC_TZ = 'America/Los_Angeles';
    const nextResetUTC = getNextMidnightInTimezoneUTC(PACIFIC_TZ);
    return nextResetUTC.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Comprehensive query limit check that includes limit validation and metadata.
   * This is the main method that should be used before processing queries.
   * 
   * @param userId - The user's UUID
   * @returns Promise<QueryLimitCheckResult>
   */
  async checkQueryLimit(userId: string): Promise<QueryLimitCheckResult> {
    if (!userId) {
      return {
        canProceed: false,
        isLimitReached: true,
        currentCount: 0,
        limit: DAILY_QUERY_LIMIT,
        nextResetTime: this.getNextResetTime(),
        error: 'User ID is required'
      };
    }

    try {
      const currentCount = await this.getCurrentQueryCount(userId);
      const isLimitReached = currentCount >= DAILY_QUERY_LIMIT;

      return {
        canProceed: !isLimitReached,
        isLimitReached,
        currentCount,
        limit: DAILY_QUERY_LIMIT,
        nextResetTime: this.getNextResetTime(),
        error: null
      };
    } catch (error) {
      console.error('QueryLimitService: Error in comprehensive limit check:', error);
      return {
        canProceed: false, // Fail-safe: deny access if check fails
        isLimitReached: true,
        currentCount: 0,
        limit: DAILY_QUERY_LIMIT,
        nextResetTime: this.getNextResetTime(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Result interface for comprehensive query limit checks.
 */
export interface QueryLimitCheckResult {
  canProceed: boolean;
  isLimitReached: boolean;
  currentCount: number;
  limit: number;
  nextResetTime: string;
  error: string | null;
}

/**
 * Singleton instance for the QueryLimitService.
 * Provides a single point of access while maintaining testability.
 */
export const queryLimitService = new QueryLimitService();
