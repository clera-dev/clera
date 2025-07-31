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
 * Use this in client components when you want to show dates in user's local time
 * @param dateString - ISO date string
 * @returns Object with formatted date and time strings
 */
export const formatTransferDateLocal = (dateString: string) => {
  // Only run on client side to prevent hydration mismatches
  if (typeof window === 'undefined') {
    return {
      date: 'Loading...',
      time: 'Loading...'
    };
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