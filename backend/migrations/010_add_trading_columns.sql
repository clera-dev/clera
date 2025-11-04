-- Migration 010: Add Trading Columns to user_investment_accounts
-- Purpose: Add cash_balance and buying_power columns for trade execution and account selection
-- Date: 2025-10-28
-- 
-- These columns are required for:
-- 1. Displaying available buying power in OrderModal account selection
-- 2. Validating trades against available cash
-- 3. Showing account balances in trade-enabled account lists

-- Add cash_balance column (nullable to allow legacy accounts)
ALTER TABLE user_investment_accounts 
ADD COLUMN IF NOT EXISTS cash_balance DECIMAL(15, 2) DEFAULT NULL;

-- Add buying_power column (nullable to allow legacy accounts)
ALTER TABLE user_investment_accounts 
ADD COLUMN IF NOT EXISTS buying_power DECIMAL(15, 2) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN user_investment_accounts.cash_balance IS 'Current cash balance in the account (updated during sync)';
COMMENT ON COLUMN user_investment_accounts.buying_power IS 'Available buying power for trading (may include margin, updated during sync)';

-- Create index for faster querying of trade-enabled accounts
CREATE INDEX IF NOT EXISTS idx_user_investment_accounts_trade_enabled 
ON user_investment_accounts(user_id, connection_type) 
WHERE connection_type = 'trade' AND is_active = true;

COMMENT ON INDEX idx_user_investment_accounts_trade_enabled IS 'Optimize queries for trade-enabled accounts';

-- Verify migration
DO $$
BEGIN
    -- Check if columns exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_investment_accounts' 
        AND column_name = 'cash_balance'
    ) THEN
        RAISE EXCEPTION 'Migration failed: cash_balance column not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_investment_accounts' 
        AND column_name = 'buying_power'
    ) THEN
        RAISE EXCEPTION 'Migration failed: buying_power column not created';
    END IF;
    
    RAISE NOTICE 'Migration 010 completed successfully: Added cash_balance and buying_power columns';
END $$;

