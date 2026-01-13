-- Migration 018: Backfill last_attempt_at for existing executing orders
-- 
-- CRITICAL FIX: Without this, orders stuck in 'executing' status with NULL 
-- last_attempt_at won't be detected by stuck order recovery.
-- 
-- The stuck order query uses: status='executing' AND last_attempt_at < threshold
-- NULL comparisons return NULL (not TRUE), so these orders would be invisible.

UPDATE queued_orders 
SET last_attempt_at = NOW() 
WHERE status = 'executing' AND last_attempt_at IS NULL;
