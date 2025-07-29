/**
 * Auth Storage Utilities
 * 
 * Centralized logic for managing authentication-related localStorage operations.
 * This helps maintain separation of concerns by keeping storage management
 * separate from UI components.
 */

/**
 * Clears all user-specific localStorage items to prevent cross-user session issues.
 * This includes chat sessions, account IDs, and any other Clera-specific data.
 * 
 * Should be called on:
 * - User sign out
 * - Auth state change to SIGNED_OUT
 * - Any time we need to ensure clean user session state
 * 
 * @param context - Optional context string for logging purposes
 */
export const clearUserSpecificLocalStorage = (context: string = 'auth-cleanup'): void => {
  // Ensure we're in a browser environment
  if (typeof window === 'undefined') {
    return;
  }

  console.log(`[Auth Storage] Clearing user-specific localStorage - Context: ${context}`);

  try {
    // Remove specific known keys first
    localStorage.removeItem('cleraCurrentChatSession');
    
    // Collect all keys that match user-specific patterns
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && shouldClearKey(key)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all collected keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[Auth Storage] Removed localStorage key: ${key}`);
    });
    
    console.log(`[Auth Storage] Successfully cleared ${keysToRemove.length + 1} localStorage items`);
    
  } catch (error) {
    console.error('[Auth Storage] Error clearing localStorage:', error);
  }
};

/**
 * Determines if a localStorage key should be cleared during user session cleanup.
 * 
 * @param key - The localStorage key to evaluate
 * @returns true if the key should be cleared, false otherwise
 */
const shouldClearKey = (key: string): boolean => {
  // Define patterns for user-specific keys that should be cleared
  const userSpecificPatterns = [
    'alpacaAccountId_',  // Account-specific data
    'clera',             // General Clera app data
    'user_',             // Any user-prefixed data
    'session_',          // Session data
    'chat_',             // Chat-related data
  ];
  
  return userSpecificPatterns.some(pattern => key.startsWith(pattern));
};

/**
 * Clears all localStorage data (use with extreme caution).
 * This is a nuclear option that should only be used in development
 * or specific error recovery scenarios.
 * 
 * @param context - Context string for logging purposes
 */
export const clearAllLocalStorage = (context: string = 'emergency-cleanup'): void => {
  if (typeof window === 'undefined') {
    return;
  }

  console.warn(`[Auth Storage] CLEARING ALL localStorage - Context: ${context}`);
  
  try {
    localStorage.clear();
    console.log('[Auth Storage] All localStorage data cleared');
  } catch (error) {
    console.error('[Auth Storage] Error clearing all localStorage:', error);
  }
};

/**
 * Gets a list of all user-specific localStorage keys without removing them.
 * Useful for debugging or auditing storage state.
 * 
 * @returns Array of user-specific localStorage keys
 */
export const getUserSpecificStorageKeys = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const userKeys: string[] = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && shouldClearKey(key)) {
        userKeys.push(key);
      }
    }
  } catch (error) {
    console.error('[Auth Storage] Error reading localStorage keys:', error);
  }
  
  return userKeys;
}; 