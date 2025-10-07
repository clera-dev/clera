-- Migration: Add separate completion tracking for Plaid and Brokerage onboarding
-- This allows users to complete either path independently in hybrid mode

-- Add completion timestamp columns
ALTER TABLE public.user_onboarding 
ADD COLUMN IF NOT EXISTS plaid_connection_completed_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS brokerage_account_completed_at TIMESTAMP WITH TIME ZONE NULL;

-- Add helpful comments
COMMENT ON COLUMN public.user_onboarding.plaid_connection_completed_at IS 
  'Timestamp when user successfully connected their first Plaid investment account. NULL means not completed.';

COMMENT ON COLUMN public.user_onboarding.brokerage_account_completed_at IS 
  'Timestamp when user completed KYC and Alpaca brokerage account was approved. NULL means not completed.';

-- Add index for efficient querying of completion status
CREATE INDEX IF NOT EXISTS idx_user_onboarding_completion_status 
ON public.user_onboarding (plaid_connection_completed_at, brokerage_account_completed_at)
WHERE plaid_connection_completed_at IS NOT NULL OR brokerage_account_completed_at IS NOT NULL;

-- Migration note: Existing users will have NULL for both columns
-- You can backfill based on existing data:
-- - If alpaca_account_id IS NOT NULL → set brokerage_account_completed_at = updated_at
-- - If user has records in user_investment_accounts with provider='plaid' → set plaid_connection_completed_at = earliest created_at

