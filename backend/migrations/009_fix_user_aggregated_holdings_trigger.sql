-- Migration: Fix user_aggregated_holdings trigger for updated_at field
-- Issue: Database trigger expects 'updated_at' but column is named 'last_updated'
-- Solution: Either rename column to match trigger, or update trigger to use correct column

-- OPTION 1: Rename column to match trigger expectations (RECOMMENDED)
-- This is the cleanest solution as it aligns with standard naming conventions

ALTER TABLE user_aggregated_holdings 
RENAME COLUMN last_updated TO updated_at;

-- Update any indexes or constraints that reference the old column name
-- (Note: PostgreSQL automatically updates index references when renaming columns)

-- OPTION 2 (Alternative): If you prefer to keep 'last_updated', update the trigger
-- Uncomment this block and comment out the above ALTER TABLE if you prefer this approach:

/*
-- First, find and drop the existing trigger
DROP TRIGGER IF EXISTS set_updated_at ON user_aggregated_holdings;

-- Recreate trigger with correct column name
CREATE TRIGGER set_last_updated
    BEFORE UPDATE ON user_aggregated_holdings
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated_column();

-- You may also need to create or update the trigger function:
CREATE OR REPLACE FUNCTION update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/

-- Verify the fix by checking column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_aggregated_holdings' 
        AND column_name = 'updated_at'
    ) THEN
        RAISE EXCEPTION 'Migration failed: updated_at column not found after rename';
    END IF;
    
    RAISE NOTICE '✅ Migration successful: last_updated renamed to updated_at';
END $$;

