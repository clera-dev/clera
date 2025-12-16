-- Migration 008: Add SnapTrade as an allowed provider
-- Purpose: Update the provider check constraint to include 'snaptrade'
-- Date: 2025-10-19

-- Drop the existing constraint
ALTER TABLE public.user_investment_accounts 
DROP CONSTRAINT IF EXISTS user_investment_accounts_provider_check;

-- Add the new constraint with 'snaptrade' included
ALTER TABLE public.user_investment_accounts
ADD CONSTRAINT user_investment_accounts_provider_check 
CHECK (provider IN ('plaid', 'alpaca', 'manual', 'snaptrade'));

-- Update the comment
COMMENT ON COLUMN public.user_investment_accounts.provider IS 'Data provider: plaid, alpaca, snaptrade, or manual';

