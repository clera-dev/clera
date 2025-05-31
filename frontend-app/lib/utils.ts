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
 * Retrieves the Alpaca Account ID.
 * Prioritizes fetching from localStorage. If not found, fetches from Supabase `user_onboarding` table.
 * Stores the fetched ID back into localStorage for future use.
 * 
 * @returns {Promise<string | null>} The Alpaca Account ID or null if not found.
 */
export const getAlpacaAccountId = async (): Promise<string | null> => {
  // 1. Check localStorage first
  try {
    const storedId = localStorage.getItem('alpacaAccountId');
    if (storedId && storedId !== 'null' && storedId !== 'undefined' && storedId !== 'Missing') { // Added checks for invalid strings
      console.log("Retrieved Alpaca Account ID from localStorage:", storedId);
      return storedId;
    }
  } catch (error) {
    console.error("Error reading Alpaca Account ID from localStorage:", error);
    // Proceed to fetch from Supabase even if localStorage access fails
  }

  // 2. Fallback to Supabase
  console.log("Alpaca Account ID: Attempting Supabase fallback.");
  const supabase = createClient(); // Use the client-side Supabase client
  console.log("Alpaca Account ID: Supabase client potentially created.");

  try {
    console.log("Alpaca Account ID: Attempting to get user.");
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Alpaca Account ID: Supabase auth error:", authError);
      return null;
    }
    if (!user) {
      console.warn("Alpaca Account ID: No authenticated user found via Supabase.");
      return null; // Cannot fetch without user
    }

    console.log("Alpaca Account ID: User found:", user.id, ". Attempting DB query.");
    const { data: onboardingData, error: dbError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .maybeSingle(); // Use maybeSingle to handle cases where the record might not exist yet

    if (dbError) {
      console.error("Alpaca Account ID: Supabase DB query error:", dbError);
      return null;
    }

    console.log("Alpaca Account ID: Supabase DB query successful. Data:", onboardingData);

    if (onboardingData && onboardingData.alpaca_account_id) {
      const fetchedId = onboardingData.alpaca_account_id;
      console.log("Alpaca Account ID: Retrieved from Supabase:", fetchedId);
      
      // 3. Store fetched ID back into localStorage
      try {
        localStorage.setItem('alpacaAccountId', fetchedId);
        console.log("Alpaca Account ID: Stored fetched ID into localStorage.");
      } catch (storageError) {
        console.error("Alpaca Account ID: Error storing fetched ID to localStorage:", storageError);
      }
      return fetchedId;
    } else {
      console.warn("Alpaca Account ID: Not found in Supabase onboarding data for user:", user.id);
      // Optionally store 'not_found' or similar in localStorage to prevent repeated checks?
      return null;
    }
  } catch (error) {
    console.error("Alpaca Account ID: Unexpected error during Supabase fallback:", error);
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

  console.log(`Query count for user ${userId}: ${data}`);
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
