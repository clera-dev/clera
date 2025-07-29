/**
 * Shared utilities for formatting transfer-related data
 * Used by TransferHistory.tsx and TransfersCard.tsx to avoid code duplication
 */

import React from "react";
import { CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";

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
 * Gets the appropriate icon component for a transfer status
 * @param status - The transfer status
 * @returns React icon component with appropriate styling
 */
export const getTransferStatusIcon = (status: string): React.ReactElement => {
  switch (status.toUpperCase()) {
    case 'COMPLETE':
    case 'SETTLED':
    case 'FILLED':
    case 'APPROVED':
      return React.createElement(CheckCircle, { className: "h-4 w-4 text-emerald-600" });
    case 'QUEUED':
    case 'SUBMITTED':
    case 'APPROVAL_PENDING':
    case 'PENDING':
    case 'SENT_TO_CLEARING':
      return React.createElement(Clock, { className: "h-4 w-4 text-blue-600" });
    case 'FAILED':
    case 'CANCELLED':
    case 'REJECTED':
    case 'RETURNED':
    case 'CANCELED': // Handle both spellings
      return React.createElement(XCircle, { className: "h-4 w-4 text-red-600" });
    default:
      return React.createElement(AlertCircle, { className: "h-4 w-4 text-yellow-600" });
  }
};

/**
 * Gets CSS classes for transfer status styling (for detailed view with background)
 * @param status - The transfer status
 * @returns CSS class string for styling the status badge
 */
export const getTransferStatusColorClasses = (status: string): string => {
  switch (status.toUpperCase()) {
    case 'COMPLETE':
    case 'SETTLED':
    case 'FILLED':
    case 'APPROVED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200';
    case 'QUEUED':
    case 'SUBMITTED':
    case 'APPROVAL_PENDING':
    case 'PENDING':
    case 'SENT_TO_CLEARING':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-200';
    case 'FAILED':
    case 'CANCELLED':
    case 'REJECTED':
    case 'RETURNED':
    case 'CANCELED': // Handle both spellings
      return 'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-200';
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200';
  }
};

/**
 * Gets background color classes for transfer status indicators (for simple dot indicators)
 * @param status - The transfer status
 * @returns CSS class string for the status indicator dot
 */
export const getTransferStatusDotColor = (status: string): string => {
  switch (status.toUpperCase()) {
    case 'COMPLETE':
    case 'APPROVED':
      return 'bg-green-500';
    case 'PENDING':
    case 'QUEUED':
      return 'bg-yellow-500';
    case 'REJECTED':
    case 'CANCELED':
    case 'FAILED':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

/**
 * Formats a date string into display format with date and time
 * @param dateString - ISO date string
 * @returns Object with formatted date and time strings
 */
export const formatTransferDate = (dateString: string) => {
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