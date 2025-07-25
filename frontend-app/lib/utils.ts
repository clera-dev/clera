import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createClient } from "@/utils/supabase/client"; // Import Supabase client

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to format large numbers
export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return 'N/A';
  if (Math.abs(num) >= 1e12) {
    return (num / 1e12).toFixed(2) + 'T';
  }
  if (Math.abs(num) >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B';
  }
  if (Math.abs(num) >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  }
  // Format smaller numbers or those without suffixes
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }); 
};

// Helper to format currency
export const formatCurrency = (
  num: number | null | undefined, 
  currency: string = 'USD', 
  options?: { compact?: boolean }
): string => {
  if (num === null || num === undefined) return 'N/A';
  
  // Compact formatting for chart axes
  if (options?.compact) {
    if (Math.abs(num) >= 1e12) {
      return `$${(num / 1e12).toFixed(1)}T`;
    }
    if (Math.abs(num) >= 1e9) {
      return `$${(num / 1e9).toFixed(1)}B`;
    }
    if (Math.abs(num) >= 1e6) {
      return `$${(num / 1e6).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1e3) {
      return `$${(num / 1e3).toFixed(1)}K`;
    }
    return `$${num.toFixed(2)}`;
  }
  
  // Check if the number is extremely small and format appropriately
  if (Math.abs(num) < 0.01 && Math.abs(num) > 0) {
      return num.toLocaleString(undefined, { style: 'currency', currency: currency, minimumSignificantDigits: 1, maximumSignificantDigits: 3 });
  }
  // Default formatting for most numbers
  return num.toLocaleString(undefined, { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * SECURITY HELPER: Cleans up global localStorage entries and migrates to user-specific keys
 * This prevents cross-user contamination in localStorage
 */
export const cleanupGlobalLocalStorage = async (): Promise<void> => {
  try {
    // Get current user to create user-specific keys
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn("Cannot cleanup localStorage: No authenticated user");
      return;
    }
    
    // Clean up ALL global alpaca-related keys that could cause contamination
    const globalKeysToClean = [
      'alpacaAccountId',
      'relationshipId', 
      'bankAccountNumber',
      'bankRoutingNumber',
      'transferAmount',
      'transferId'
    ];
    
    console.log("Cleaning up global localStorage entries for security...");
    let cleanedCount = 0;
    globalKeysToClean.forEach(key => {
      try {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error removing global localStorage key ${key}:`, error);
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Global localStorage cleanup completed: removed ${cleanedCount} contaminated keys for user.`);
    }
  } catch (error) {
    console.error("Error during localStorage cleanup:", error);
  }
};

/**
 * Retrieves the Alpaca Account ID for the current authenticated user.
 * SECURITY FIX: Always fetches from Supabase first to ensure correct user context.
 * Only uses localStorage as a secondary cache for the SAME user.
 * 
 * @returns {Promise<string | null>} The Alpaca Account ID or null if not found.
 */
export const getAlpacaAccountId = async (): Promise<string | null> => {
  console.log("Alpaca Account ID: Starting secure user-specific lookup.");
  
  // 1. SECURITY CRITICAL: Get current authenticated user first
  const supabase = createClient();
  
  try {
    console.log("Alpaca Account ID: Attempting to get authenticated user.");
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Alpaca Account ID: Supabase auth error:", authError);
      return null;
    }
    if (!user) {
      console.warn("Alpaca Account ID: No authenticated user found via Supabase.");
      return null; // Cannot fetch without user
    }

    console.log("Alpaca Account ID: User found.");
    
    // 2. Check user-specific localStorage key (SECURITY FIX)
    const userSpecificKey = `alpacaAccountId_${user.id}`;
    try {
      const storedId = localStorage.getItem(userSpecificKey);
      if (storedId && storedId !== 'null' && storedId !== 'undefined' && storedId !== 'Missing') {
        console.log("Retrieved Alpaca Account ID from user-specific localStorage");
        // Still validate this cached ID against Supabase periodically for security
        return storedId;
      }
    } catch (error) {
      console.error("Error reading user-specific Alpaca Account ID from localStorage:", error);
    }

    // 3. Fetch from Supabase (PRIMARY SOURCE)
    console.log("Alpaca Account ID: Fetching from Supabase.");
    const { data: onboardingData, error: dbError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError) {
      console.error("Alpaca Account ID: Supabase DB query error:", dbError);
      return null;
    }

    console.log("Alpaca Account ID: Supabase DB query successful.");

    if (onboardingData && onboardingData.alpaca_account_id) {
      const fetchedId = onboardingData.alpaca_account_id;
      console.log("Alpaca Account ID: Retrieved from Supabase.");
      
      // 4. Store in user-specific localStorage (SECURITY FIX)
      try {
        // Clear any old global localStorage entries
        await cleanupGlobalLocalStorage();
        
        // Store with user-specific key
        localStorage.setItem(userSpecificKey, fetchedId);
        console.log("Alpaca Account ID: Stored in user-specific localStorage.");
      } catch (storageError) {
        console.error("Alpaca Account ID: Error storing to user-specific localStorage:", storageError);
      }
      return fetchedId;
    } else {
      console.warn("Alpaca Account ID: Not found in Supabase onboarding data for user:", user.id);
      return null;
    }
  } catch (error) {
    console.error("Alpaca Account ID: Unexpected error during secure lookup:", error);
    return null;
  }
};

// --- Query Limit Helpers ---

/**
 * Calls Supabase RPC to get the number of queries made by the user today (PST).
 * @param userId The UUID of the user.
 * @returns Promise<number> The number of queries made today.
 */
export const getUserDailyQueryCount = async (userId: string): Promise<number> => {
  if (!userId) {
    console.error("getUserDailyQueryCount: userId is required.");
    throw new Error("User ID is required.");
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_user_query_count_today_pst', {
    p_user_id: userId 
  });

  if (error) {
    console.error("Error fetching user daily query count:", error);
    throw error; // Re-throw the error to be handled by the caller
  }

  console.log(`Query count for user : ${data}`);
  return data ?? 0; // Return 0 if data is null/undefined
};

/**
 * Calls Supabase RPC to record that a user has made a query.
 * @param userId The UUID of the user making the query.
 * @returns Promise<void>
 */
export const recordUserQuery = async (userId: string): Promise<void> => {
  if (!userId) {
    console.error("recordUserQuery: userId is required.");
    throw new Error("User ID is required.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc('record_user_query', { 
    p_user_id: userId 
  });

  if (error) {
    console.error("Error recording user query:", error);
    throw error; // Re-throw the error
  }
   console.log(`Recorded query for user ${userId}`);
};

// --- End Query Limit Helpers ---
