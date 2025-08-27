/**
 * Shared utility for fetching portfolio positions from backend
 * Used by: cron jobs, daily summary, and other services
 */

interface PortfolioPosition {
  symbol: string;
  qty: string;
}

interface PortfolioFetchOptions {
  backendUrl?: string;
  backendApiKey?: string;
  cache?: RequestCache;
  customHeaders?: Record<string, string>; // For custom auth headers (JWT, etc.)
}

/**
 * Fetches portfolio positions from backend API for a given account
 * @param accountId - Alpaca account ID
 * @param options - Configuration options
 * @returns Array of portfolio positions or null on error
 */
export async function fetchPortfolioPositions(
  accountId: string,
  options: PortfolioFetchOptions = {}
): Promise<PortfolioPosition[] | null> {
  try {
    const {
      backendUrl = process.env.BACKEND_API_URL,
      backendApiKey = process.env.BACKEND_API_KEY,
      cache = 'no-store',
      customHeaders
    } = options;

    if (!backendUrl) {
      console.warn('Portfolio Fetcher: Backend URL not configured');
      return null;
    }

    // Validate and sanitize account ID
    const rawAccountId = String(accountId).trim();
    if (!/^[-a-zA-Z0-9_]+$/.test(rawAccountId)) {
      console.warn('Portfolio Fetcher: Invalid account ID format');
      return null;
    }

    const safeAccountId = encodeURIComponent(rawAccountId);
    const targetUrl = `${backendUrl}/api/portfolio/${safeAccountId}/positions`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    
    // Use custom headers if provided (for JWT auth), otherwise use API key
    if (customHeaders) {
      Object.assign(headers, customHeaders);
    } else if (backendApiKey) {
      headers['x-api-key'] = backendApiKey;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache
    });

    if (!response.ok) {
      console.warn(`Portfolio Fetcher: Backend request failed with status ${response.status}`);
      return null;
    }

    const positions: PortfolioPosition[] = await response.json();
    
    if (!Array.isArray(positions)) {
      console.warn('Portfolio Fetcher: Invalid response format from backend');
      return null;
    }

    return positions;

  } catch (error: any) {
    console.warn(`Portfolio Fetcher: Error fetching positions: ${error.message}`);
    return null;
  }
}

/**
 * Converts portfolio positions to human-readable string format
 * @param positions - Array of portfolio positions
 * @returns Formatted string like "AAPL (100 shares), GOOGL (50 shares)"
 */
export function formatPortfolioString(positions: PortfolioPosition[]): string {
  if (!positions || positions.length === 0) {
    return '';
  }
  
  return positions.map(p => `${p.symbol} (${p.qty} shares)`).join(', ');
}

/**
 * Fetches user's account ID from Supabase and then fetches their portfolio
 * @param userId - User ID
 * @param supabase - Supabase client
 * @param options - Fetch options
 * @returns Formatted portfolio string
 */
export async function fetchUserPortfolioString(
  userId: string,
  supabase: any,
  options: PortfolioFetchOptions = {}
): Promise<string> {
  try {
    // Get user's alpaca account ID
    const { data: onboardingData, error } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', userId)
      .single();
    
    if (error || !onboardingData?.alpaca_account_id) {
      console.warn(`Portfolio Fetcher: No account found for user ${userId}`);
      return '';
    }

    const positions = await fetchPortfolioPositions(onboardingData.alpaca_account_id, options);
    return positions ? formatPortfolioString(positions) : '';

  } catch (error: any) {
    console.warn(`Portfolio Fetcher: Error fetching user portfolio: ${error.message}`);
    return '';
  }
}
