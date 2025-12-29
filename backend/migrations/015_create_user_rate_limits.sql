-- Migration: 015_create_user_rate_limits
-- Description: Create table for secure rate limiting of user actions
-- Date: 2024-12-29

-- This table provides production-grade rate limiting with:
-- - Atomic operations (prevents race conditions)
-- - Per-user, per-action tracking
-- - Historical action counts for monitoring
-- - Indexed for fast lookups

CREATE TABLE IF NOT EXISTS user_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,  -- e.g., 'portfolio_refresh', 'trade_execution'
    last_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint ensures one record per user per action type
    UNIQUE(user_id, action_type)
);

-- Index for fast lookups by user_id and action_type
CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user_action 
ON user_rate_limits(user_id, action_type);

-- Index for cleanup of old records (if needed)
CREATE INDEX IF NOT EXISTS idx_user_rate_limits_last_action 
ON user_rate_limits(last_action_at);

-- Enable Row Level Security
ALTER TABLE user_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own rate limits
CREATE POLICY "Users can view own rate limits"
ON user_rate_limits FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System can manage all rate limits (via service role)
-- The backend uses service_role key which bypasses RLS

-- Add comment for documentation
COMMENT ON TABLE user_rate_limits IS 'Tracks rate limits for user actions to prevent abuse. Used by portfolio refresh and other rate-limited operations.';
COMMENT ON COLUMN user_rate_limits.action_type IS 'Type of action being rate-limited (e.g., portfolio_refresh, trade_execution)';
COMMENT ON COLUMN user_rate_limits.last_action_at IS 'Timestamp of the last time this action was performed';
COMMENT ON COLUMN user_rate_limits.action_count IS 'Total number of times this action has been performed (for analytics)';

