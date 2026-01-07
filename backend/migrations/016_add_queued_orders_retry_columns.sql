-- Migration 016: Add retry tracking columns to queued_orders
-- These columns support the production-grade queued order executor with retry logic.

-- CRITICAL: Update CHECK constraint to include 'needs_review' status
-- This is used by the stuck order recovery system to flag orders for manual review
-- Without this, setting status='needs_review' will fail at runtime
ALTER TABLE queued_orders DROP CONSTRAINT IF EXISTS queued_orders_status_check;
ALTER TABLE queued_orders ADD CONSTRAINT queued_orders_status_check 
    CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled', 'needs_review'));

-- Add retry tracking columns
ALTER TABLE queued_orders 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

ALTER TABLE queued_orders 
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE queued_orders 
ADD COLUMN IF NOT EXISTS execution_result JSONB;

-- Rename error_message to last_error for consistency (if error_message exists)
-- This migration: 1) Copies data to last_error, 2) Drops the old column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'queued_orders' 
        AND column_name = 'error_message'
    ) THEN
        -- Copy data to new column first
        UPDATE queued_orders SET last_error = error_message WHERE error_message IS NOT NULL AND last_error IS NULL;
        
        -- Drop the deprecated column to complete the rename
        -- This prevents confusion about which column to use
        ALTER TABLE queued_orders DROP COLUMN error_message;
    END IF;
END $$;

-- Add index for retry processing (find orders that haven't exceeded max retries)
CREATE INDEX IF NOT EXISTS idx_queued_orders_retry ON queued_orders(status, retry_count) 
WHERE status = 'pending';

-- Comment
COMMENT ON COLUMN queued_orders.retry_count IS 'Number of execution attempts for this order';
COMMENT ON COLUMN queued_orders.last_error IS 'Most recent error message from execution attempt';
COMMENT ON COLUMN queued_orders.execution_result IS 'Full result object from successful execution';

