-- Migration 017: Add last_attempt_at column to queued_orders
-- 
-- This column is required by the QueuedOrderExecutor to track when
-- an order was last attempted for execution. Used to detect stuck orders.
--
-- Note: Migration 016 was missing this column, causing runtime errors:
-- ERROR: column queued_orders.last_attempt_at does not exist

ALTER TABLE queued_orders 
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN queued_orders.last_attempt_at IS 'Timestamp of last execution attempt (used for stuck order detection)';

-- Create index for efficient stuck order queries
-- The executor queries: status='executing' AND last_attempt_at < threshold
CREATE INDEX IF NOT EXISTS idx_queued_orders_last_attempt 
ON queued_orders(status, last_attempt_at) 
WHERE status = 'executing';
