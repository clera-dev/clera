-- Migration 020: Add staleness metadata and cancellation reason to queued_orders
-- This supports protective limit pricing and staleness cancellation audits.

ALTER TABLE queued_orders
ADD COLUMN IF NOT EXISTS last_price_at_creation DECIMAL(15, 4),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN queued_orders.last_price_at_creation IS 'Last market price at time of queueing (used for staleness checks)';
COMMENT ON COLUMN queued_orders.cancellation_reason IS 'Reason for cancellation (expired_stale, price_deviation_exceeded, user_cancelled, etc.)';
