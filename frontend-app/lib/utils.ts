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
export const formatCurrency = (num: number | null | undefined, currency: string = 'USD'): string => {
  if (num === null || num === undefined) return 'N/A';
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
  console.log("Alpaca Account ID not found in localStorage or invalid. Fetching from Supabase...");
  const supabase = createClient(); // Use the client-side Supabase client

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Error getting user for Supabase fetch:", authError);
      return null; // Cannot fetch without user
    }

    const { data: onboardingData, error: dbError } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', user.id)
      .maybeSingle(); // Use maybeSingle to handle cases where the record might not exist yet

    if (dbError) {
      console.error("Error fetching Alpaca Account ID from Supabase:", dbError);
      return null;
    }

    if (onboardingData && onboardingData.alpaca_account_id) {
      const fetchedId = onboardingData.alpaca_account_id;
      console.log("Retrieved Alpaca Account ID from Supabase:", fetchedId);
      
      // 3. Store fetched ID back into localStorage
      try {
        localStorage.setItem('alpacaAccountId', fetchedId);
        console.log("Stored fetched Alpaca Account ID into localStorage.");
      } catch (storageError) {
        console.error("Error storing fetched Alpaca Account ID to localStorage:", storageError);
      }
      return fetchedId;
    } else {
      console.log("Alpaca Account ID not found in Supabase for user:", user.id);
      return null;
    }
  } catch (error) {
    console.error("Unexpected error fetching Alpaca Account ID:", error);
    return null;
  }
};
