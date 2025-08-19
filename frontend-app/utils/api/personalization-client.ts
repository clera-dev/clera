// Note: This module is intentionally server-safe (no browser-only APIs)
// so it can be imported by both client and server code without forcing
// client bundling. Calls rely on Next.js API routes and will inherit
// cookies automatically only in client contexts.

import { 
  PersonalizationData,
  PersonalizationFormData,
} from "@/lib/types/personalization";

// API response interfaces
interface PersonalizationApiResponse {
  success: boolean;
  data: PersonalizationData | null;
  message?: string;
  error?: string;
  details?: string[];
}

/**
 * Builds an absolute URL for API calls that works on both client and server.
 * - Client: uses window.location.origin to preserve cookies automatically
 * - Server: uses environment variables to construct the origin
 */
function buildAbsoluteUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || null;
  const base = vercelUrl || appUrl || 'http://localhost:3000';
  return `${base}${normalizedPath}`;
}

/**
 * Safely extracts an error message from a Response without assuming JSON.
 * Consumes the body only on error paths.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';
    const bodyText = await response.text();
    if (!bodyText) return `HTTP ${response.status}`;
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(bodyText);
        return json.error || json.message || JSON.stringify(json);
      } catch {
        return bodyText; // Not valid JSON despite header
      }
    }
    return bodyText;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Fetches the user's personalization data
 * @returns PersonalizationData if exists, null if no data exists yet
 * @throws Error if fetch fails or server returns error
 */
export async function getPersonalizationData(): Promise<PersonalizationData | null> {
  try {
    const response = await fetch(buildAbsoluteUrl('/api/personalization'), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response);
      console.error('Error fetching personalization data:', errorMessage);
      throw new Error(`Failed to fetch personalization data: ${errorMessage}`);
    }

    // Ensure we only proceed with valid JSON and surface app-level errors
    const contentType = response.headers.get('content-type') || '';
    let result: PersonalizationApiResponse | null = null;

    if (contentType.includes('application/json')) {
      try {
        result = await response.json();
      } catch {
        throw new Error('Failed to parse personalization response JSON');
      }
    } else {
      const bodyText = await response.text().catch(() => '');
      throw new Error(bodyText || 'Unexpected response format while fetching personalization data');
    }

    if (!result) {
      throw new Error('Empty response while fetching personalization data');
    }

    if (result.success === false) {
      const message = result.error || result.message || 'Server reported an error fetching personalization data';
      throw new Error(message);
    }

    if (result.success && result.data) {
      return result.data;
    }
    
    // success true but no data yet
    return null;

  } catch (error) {
    // Re-throw network errors and parsing errors so component can handle them
    if (error instanceof Error) {
      throw error;
    }
    console.error('Error fetching personalization data:', error);
    throw new Error('Network error occurred while fetching personalization data');
  }
}

/**
 * Saves new personalization data for the user
 */
export async function savePersonalizationData(
  data: PersonalizationFormData
): Promise<{ success: boolean; data?: PersonalizationData; error?: string; statusCode?: number }> {
  try {
    const response = await fetch(buildAbsoluteUrl('/api/personalization'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response);
      console.error('Error saving personalization data:', errorMessage);
      return {
        success: false,
        error: errorMessage || 'Failed to save personalization data',
        statusCode: response.status
      };
    }

    const result: PersonalizationApiResponse = await response.json();

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data
      };
    }

    return {
      success: false,
      error: result.error || 'Unknown error occurred'
    };

  } catch (error) {
    console.error('Error saving personalization data');
    return {
      success: false,
      error: 'Network error occurred'
    };
  }
}

/**
 * Updates existing personalization data for the user
 */
export async function updatePersonalizationData(
  data: PersonalizationFormData
): Promise<{ success: boolean; data?: PersonalizationData; error?: string; statusCode?: number }> {
  try {
    const response = await fetch(buildAbsoluteUrl('/api/personalization'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorMessage = await extractErrorMessage(response);
      // Only log as error if it's not a 404 (which is expected for new users)
      if (response.status !== 404) {
        console.error('Error updating personalization data:', errorMessage);
      }
      return {
        success: false,
        error: errorMessage || 'Failed to update personalization data',
        statusCode: response.status
      };
    }

    const result: PersonalizationApiResponse = await response.json();

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data
      };
    }

    return {
      success: false,
      error: result.error || 'Unknown error occurred'
    };

  } catch (error) {
    console.error('Error updating personalization data');
    return {
      success: false,
      error: 'Network error occurred'
    };
  }
}

/**
 * Saves or updates personalization data (handles both create and update)
 */
export async function saveOrUpdatePersonalizationData(
  data: PersonalizationFormData
): Promise<{ success: boolean; data?: PersonalizationData; error?: string }> {
  // First, check if data exists by trying to fetch it
  try {
    const existingData = await getPersonalizationData();
    
    if (existingData) {
      // Data exists, try to update
      console.log('Found existing personalization data, updating...');
      return await updatePersonalizationData(data);
    } else {
      // No data exists, create new
      console.log('No existing personalization data found, creating new...');
      return await savePersonalizationData(data);
    }
  } catch (error) {
    console.error('Error checking existing personalization data:', error);
    
    // Fallback to the original update-first logic
    const updateResult = await updatePersonalizationData(data);
    
    // If update fails because no data exists, try to create
    if (!updateResult.success && updateResult.statusCode === 404) {
      console.log('Update failed with 404, trying to create...');
      return await savePersonalizationData(data);
    }
    
    return updateResult;
  }
}
