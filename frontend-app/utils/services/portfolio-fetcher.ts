/**
 * Shared utility for fetching portfolio positions from backend
 * Used by: cron jobs, daily summary, and other services
 */
import 'server-only';

/**
 * Portfolio fetch result with success/error information
 */
interface PortfolioFetchResult {
  success: boolean;
  data?: PortfolioPosition[];
  error?: {
    type: 'validation' | 'network' | 'timeout' | 'backend' | 'unknown';
    message: string;
    status?: number;
    details?: any;
  };
}

interface PortfolioPosition {
  symbol: string;
  qty: string;
}

interface PortfolioFetchOptions {
  backendUrl?: string;
  backendApiKey?: string;
  cache?: RequestCache;
  customHeaders?: Record<string, string>; // For custom auth headers (JWT, etc.)
  timeoutMs?: number; // Request timeout in milliseconds (default: 30 seconds)
}



/**
 * Fetches portfolio positions from backend API for a given account
 * @param accountId - Alpaca account ID (must be valid UUID format)
 * @param options - Configuration options including timeout
 * @returns PortfolioFetchResult with success/error information and data
 * @throws Will timeout after 30 seconds (default) or specified timeoutMs
 */
export async function fetchPortfolioPositions(
  accountId: string,
  options: PortfolioFetchOptions = {}
): Promise<PortfolioFetchResult> {
  // Avoid leaking secrets in production logs; suppress console output outside dev/test
  const logWarn = (...args: any[]) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  };
  try {
    const {
      backendUrl = process.env.BACKEND_API_URL,
      // Do NOT default to env for secrets here to avoid accidental client exposure
      backendApiKey,
      cache = 'no-store',
      customHeaders
    } = options;

    if (!backendUrl) {
      logWarn('Portfolio Fetcher: Backend URL not configured');
      return {
        success: false,
        error: {
          type: 'validation',
          message: 'Backend URL not configured'
        }
      };
    }

    // Validate and sanitize account ID - must be valid UUID format
    const rawAccountId = String(accountId).trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawAccountId)) {
      logWarn('Portfolio Fetcher: Invalid account ID format - must be valid UUID');
      return {
        success: false,
        error: {
          type: 'validation',
          message: 'Invalid account ID format - must be valid UUID'
        }
      };
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

    // Create abort controller for timeout to prevent hung requests from stalling scheduled jobs
    const timeoutMs = options.timeoutMs || 30000; // Default 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        cache,
        signal: controller.signal
      });

      // Clear timeout since request completed
      clearTimeout(timeoutId);

      if (!response.ok) {
        logWarn(`Portfolio Fetcher: Backend request failed with status ${response.status}`);
        return {
          success: false,
          error: {
            type: 'backend',
            message: `Backend request failed with status ${response.status}`,
            status: response.status
          }
        };
      }

      const positions: PortfolioPosition[] = await response.json();
      
      if (!Array.isArray(positions)) {
        logWarn('Portfolio Fetcher: Invalid response format from backend');
        return {
          success: false,
          error: {
            type: 'backend',
            message: 'Invalid response format from backend'
          }
        };
      }

      return {
        success: true,
        data: positions
      };

    } catch (fetchError: any) {
      // Clear timeout since request failed
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        logWarn(`Portfolio Fetcher: Request timed out after ${timeoutMs}ms for account ${accountId}`);
        return {
          success: false,
          error: {
            type: 'timeout',
            message: `Request timed out after ${timeoutMs}ms for account ${accountId}`
          }
        };
      }
      
      throw fetchError; // Re-throw other errors to be caught by outer try-catch
    }

  } catch (error: any) {
    logWarn(`Portfolio Fetcher: Error fetching positions: ${error.message}`);
    return {
      success: false,
      error: {
        type: 'unknown',
        message: `Error fetching positions: ${error.message}`,
        details: error
      }
    };
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
    const logWarn = (...args: any[]) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(...args);
      }
    };
    // Get user's alpaca account ID
    const { data: onboardingData, error } = await supabase
      .from('user_onboarding')
      .select('alpaca_account_id')
      .eq('user_id', userId)
      .single();
    
    if (error || !onboardingData?.alpaca_account_id) {
      logWarn(`Portfolio Fetcher: No account found for user ${userId}`);
      return '';
    }

    const result = await fetchPortfolioPositions(onboardingData.alpaca_account_id, {
      ...options,
      timeoutMs: options.timeoutMs || 30000 // Ensure timeout is set for user portfolio fetch
    });
    
    if (!result.success || !result.data) {
      return '';
    }
    
    return formatPortfolioString(result.data);

  } catch (error: any) {
    const warn = (...args: any[]) => {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(...args);
      }
    };
    warn(`Portfolio Fetcher: Error fetching user portfolio: ${error.message}`);
    return '';
  }
}
