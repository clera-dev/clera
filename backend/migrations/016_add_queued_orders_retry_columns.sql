-- Migration 016: Add retry tracking columns to queued_orders
-- These columns support the production-grade queued order executor with retry logic.

-- CRITICAL: Update CHECK constraint to include 'needs_review' status
-- This is used by the stuck order recovery system to flag orders for manual review
-- Without this, setting status='needs_review' will fail at runtime
-- 
-- NOTE: PostgreSQL auto-generates constraint names for inline CHECK constraints.
-- The name format is typically {table}_{column}_check but this isn't guaranteed.
-- We must dynamically find and drop the actual constraint name from pg_constraint.
--
-- IMPORTANT: PostgreSQL normalizes 'IN (...)' to '= ANY (ARRAY[...])' in system catalogs,
-- so we use pg_attribute join to reliably find CHECK constraints on the status column.
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    -- Find CHECK constraints that reference the 'status' column
    -- Join with pg_attribute to reliably identify the column, avoiding LIKE pattern issues
    -- with PostgreSQL's internal constraint definition format
    SELECT c.conname INTO constraint_name_var
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'queued_orders'
      AND n.nspname = 'public'
      AND c.contype = 'c'  -- CHECK constraint
      AND a.attname = 'status'
    LIMIT 1;  -- In case there are multiple, take the first (shouldn't happen for our use case)
    
    -- Drop the existing constraint if found
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE queued_orders DROP CONSTRAINT ' || quote_ident(constraint_name_var);
        RAISE NOTICE 'Dropped existing status constraint: %', constraint_name_var;
    END IF;
END $$;

-- Add new constraint with 'needs_review' status included
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

