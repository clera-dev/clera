-- Migration 012: Add user preference for buying power display
-- Created: 2025-11-02
-- Purpose: Allow users to choose between showing cash only or cash + margin

-- Create user_preferences table for storing user-specific settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buying_power_display VARCHAR(20) DEFAULT 'cash_only' CHECK (buying_power_display IN ('cash_only', 'cash_and_margin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Add comment for documentation
COMMENT ON TABLE user_preferences IS 'User-specific preferences for trading and UI behavior';
COMMENT ON COLUMN user_preferences.buying_power_display IS 'User preference for order modal: cash_only (default, safer) or cash_and_margin (includes margin)';

-- Verification query
SELECT 
    table_name,
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_preferences' 
ORDER BY ordinal_position;

