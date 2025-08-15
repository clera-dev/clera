"use client";

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
 * Fetches the user's personalization data
 */
export async function getPersonalizationData(): Promise<PersonalizationData | null> {
  try {
    const response = await fetch('/api/personalization', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      await response.json().catch(() => null);
      console.error('Error fetching personalization data');
      return null;
    }

    const result: PersonalizationApiResponse = await response.json();
    
    if (result.success && result.data) {
      return result.data;
    }
    
    // No data exists yet (user hasn't completed personalization)
    return null;

  } catch (error) {
    console.error('Error fetching personalization data:', error);
    return null;
  }
}

/**
 * Saves new personalization data for the user
 */
export async function savePersonalizationData(
  data: PersonalizationFormData
): Promise<{ success: boolean; data?: PersonalizationData; error?: string }> {
  try {
    const response = await fetch('/api/personalization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result: PersonalizationApiResponse = await response.json();

    if (!response.ok) {
      console.error('Error saving personalization data');
      return {
        success: false,
        error: result.error || 'Failed to save personalization data'
      };
    }

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
): Promise<{ success: boolean; data?: PersonalizationData; error?: string }> {
  try {
    const response = await fetch('/api/personalization', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result: PersonalizationApiResponse = await response.json();

    if (!response.ok) {
      console.error('Error updating personalization data');
      return {
        success: false,
        error: result.error || 'Failed to update personalization data'
      };
    }

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
  // First try to update (most common case)
  const updateResult = await updatePersonalizationData(data);
  
  // If update fails because no data exists, try to create
  if (!updateResult.success && updateResult.error?.includes('No personalization data found')) {
    return await savePersonalizationData(data);
  }
  
  return updateResult;
}
