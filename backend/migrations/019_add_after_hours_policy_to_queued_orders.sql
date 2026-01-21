-- Migration 019: Add after-hours policy metadata to queued_orders
-- Stores the user's after-hours choice for auditing and correct UI display.

ALTER TABLE queued_orders
ADD COLUMN IF NOT EXISTS after_hours_policy TEXT,
ADD COLUMN IF NOT EXISTS extended_hours BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN queued_orders.after_hours_policy IS 'After-hours handling policy (broker_limit_gtc or queue_for_open)';
COMMENT ON COLUMN queued_orders.extended_hours IS 'Whether order requested extended hours (if broker supports it)';
