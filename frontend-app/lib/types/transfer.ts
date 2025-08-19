/**
 * Shared types and utilities for transfer status handling
 * Used by both client-side components and server-side API routes
 */

export interface TransferStatusData {
  status: string;
  transfer_completed: boolean;
  amount?: string | number;
  created_at?: string;
  updated_at?: string;
}

export interface TransferStateFlags {
  transferReady: boolean;
  transferFailed: boolean;
  isPending: boolean;
}

/**
 * Evaluates transfer status and returns appropriate state flags
 * This is pure client-side logic that doesn't need backend secrets
 * 
 * SUCCESS STATES: QUEUED (transfer queued), SUBMITTED (transfer submitted), 
 *                 COMPLETED, SETTLED, COMPLETE, FILLED, APPROVED
 */
export function evaluateTransferState(status: string | undefined): TransferStateFlags {
  // Handle both 'QUEUED' and 'TransferStatus.QUEUED' formats
  const up = String(status || '').toUpperCase().replace('TRANSFERSTATUS.', '');
  const transferReady = ['QUEUED', 'SUBMITTED', 'COMPLETED', 'SETTLED', 'COMPLETE', 'FILLED', 'APPROVED'].includes(up);
  const transferFailed = ['FAILED', 'CANCELLED', 'CANCELED', 'REJECTED', 'RETURNED'].includes(up);
  return {
    transferReady,
    transferFailed,
    isPending: !transferReady && !transferFailed,
  };
}
