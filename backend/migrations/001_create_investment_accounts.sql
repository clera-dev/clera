-- Migration 001: Create user_investment_accounts table
-- Purpose: Support multiple investment accounts from various providers (Plaid, Alpaca, etc.)
-- Author: Portfolio Aggregation Pivot
-- Date: 2025-01-13

-- Create the main investment accounts table
CREATE TABLE public.user_investment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Provider information
    provider TEXT NOT NULL CHECK (provider IN ('plaid', 'alpaca', 'manual')),
    provider_account_id TEXT NOT NULL,
    provider_item_id TEXT, -- Plaid item ID or similar identifier
    
    -- Account details
    institution_id TEXT, -- Plaid institution ID or equivalent
    institution_name TEXT NOT NULL,
    account_name TEXT,
    account_type TEXT NOT NULL, -- 'brokerage', '401k', 'ira', 'roth_ira', '529', 'hsa'
    account_subtype TEXT, -- More specific type from provider
    
    -- Access and sync information
    access_token_encrypted TEXT, -- Encrypted access token for API access
    sync_enabled BOOLEAN DEFAULT true,
    last_synced TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'error', 'disabled')),
    sync_error_message TEXT,
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_primary BOOLEAN DEFAULT false, -- Designate primary account for display
    
    -- Metadata
    raw_account_data JSONB DEFAULT '{}', -- Store provider-specific data
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(provider, provider_account_id, user_id), -- One connection per provider account
    CHECK (length(institution_name) > 0)
);

-- Create indexes for performance
CREATE INDEX idx_investment_accounts_user_id ON public.user_investment_accounts(user_id);
CREATE INDEX idx_investment_accounts_user_provider ON public.user_investment_accounts(user_id, provider, is_active);
CREATE INDEX idx_investment_accounts_sync_status ON public.user_investment_accounts(sync_status, last_synced) 
    WHERE sync_enabled = true;
CREATE INDEX idx_investment_accounts_institution ON public.user_investment_accounts(institution_name);

-- Row Level Security
ALTER TABLE public.user_investment_accounts ENABLE ROW LEVEL SECURITY;

-- SECURITY FIX: RLS Policy with WITH CHECK clause to prevent users from creating/updating records for other users
-- Without WITH CHECK, the USING clause only applies to SELECT/UPDATE/DELETE, allowing unauthorized INSERTs
CREATE POLICY "Users can manage their investment accounts" 
    ON public.user_investment_accounts
    FOR ALL 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at column
CREATE TRIGGER update_investment_accounts_updated_at 
    BEFORE UPDATE ON public.user_investment_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE public.user_investment_accounts IS 'Investment accounts connected from multiple providers for portfolio aggregation';
COMMENT ON COLUMN public.user_investment_accounts.provider IS 'Data provider: plaid, alpaca, or manual';
COMMENT ON COLUMN public.user_investment_accounts.access_token_encrypted IS 'Encrypted API access token for data fetching';
COMMENT ON COLUMN public.user_investment_accounts.sync_status IS 'Current sync status of account data';
COMMENT ON COLUMN public.user_investment_accounts.raw_account_data IS 'Original account data from provider for debugging';

-- Verify table creation
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_investment_accounts'
ORDER BY ordinal_position;
