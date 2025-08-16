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
 */
export function evaluateTransferState(status: string | undefined): TransferStateFlags {
  const up = String(status || '').toUpperCase();
  const transferReady = ['COMPLETED', 'SETTLED'].includes(up);
  const transferFailed = ['FAILED', 'CANCELLED', 'REJECTED', 'RETURNED'].includes(up);
  return {
    transferReady,
    transferFailed,
    isPending: !transferReady && !transferFailed,
  };
}
