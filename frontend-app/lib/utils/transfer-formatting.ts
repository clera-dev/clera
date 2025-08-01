/**
 * Pure business logic utilities for formatting transfer-related data.
 * 
 * ARCHITECTURE: This module contains only pure functions for data transformation.
 * UI concerns (React components, CSS classes) are handled in the presentation layer.
 * 
 * TIMEZONE HANDLING:
 * - formatTransferDate(): Uses UTC timezone to prevent server-client rendering mismatches
 * - formatTransferDateLocal(): Client-side only, respects user's local timezone
 */

/**
 * Formats transfer status from API format to display format
 * Converts underscores to spaces and capitalizes each word
 * @param status - The status string from the API (e.g., "approval_pending")
 * @returns Formatted status string (e.g., "Approval Pending")
 */
export const formatTransferStatus = (status: string): string => {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};



/**
 * Formats a date string into display format with date and time
 * Uses UTC timezone to prevent server-client rendering mismatches
 * @param dateString - ISO date string
 * @returns Object with formatted date and time strings
 */
export const formatTransferDate = (dateString: string) => {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'UTC' // Explicitly use UTC to prevent server-client mismatches
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC' // Explicitly use UTC to prevent server-client mismatches
    })
  };
};

/**
 * Client-side only date formatting that respects user's local timezone
 * 
 * IMPORTANT: This function should NOT be called during SSR to prevent hydration mismatches.
 * Use this only in client components after hydration, or use formatTransferDate() for SSR-safe formatting.
 * 
 * For SSR-safe usage patterns:
 * 1. Use with useEffect + useState to set formatted date after hydration
 * 2. Use in 'use client' components only
 * 3. Consider using formatTransferDate() instead if SSR compatibility is needed
 * 
 * @param dateString - ISO date string
 * @returns Object with formatted date and time strings in user's local timezone
 */
export const formatTransferDateLocal = (dateString: string) => {
  // ARCHITECTURAL FIX: Throw an error during SSR to prevent hydration mismatches
  // This forces developers to use proper SSR-safe patterns
  if (typeof window === 'undefined') {
    throw new Error(
      'formatTransferDateLocal() cannot be called during SSR as it causes hydration mismatches. ' +
      'Use formatTransferDate() for SSR-safe formatting, or call this function only after hydration ' +
      'using useEffect + useState pattern in client components.'
    );
  }
  
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric'
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    })
  };
};

/**
 * React hook for safely formatting dates in local timezone without hydration mismatches
 * 
 * This hook ensures that the formatted date is only calculated on the client side
 * after hydration, preventing SSR/client markup mismatches.
 * 
 * @param dateString - ISO date string
 * @returns Object with formatted date/time strings or null during SSR/before hydration
 * 
 * @example
 * ```tsx
 * function MyComponent({ transferDate }) {
 *   const localDate = useLocalDateFormat(transferDate);
 *   
 *   return (
 *     <div>
 *       {localDate ? (
 *         <span>{localDate.date} at {localDate.time}</span>
 *       ) : (
 *         <span>{formatTransferDate(transferDate).date}</span> // SSR fallback
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export const useLocalDateFormat = (dateString: string): { date: string; time: string } | null => {
  // This is not a React hook yet, but provides the pattern for implementing one
  // when React hooks are available in the calling component
  
  // For now, this is a placeholder that documents the proper pattern
  // When used in a React component, implement as:
  /*
  const [localDate, setLocalDate] = useState<{ date: string; time: string } | null>(null);
  
  useEffect(() => {
    const date = new Date(dateString);
    setLocalDate({
      date: date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      })
    });
  }, [dateString]);
  
  return localDate;
  */
  
  throw new Error(
    'useLocalDateFormat is a documentation pattern, not an actual hook. ' +
    'Implement the useState + useEffect pattern shown in the example above in your React component.'
  );
}; 