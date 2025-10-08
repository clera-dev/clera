-- Migration 002: Create user_aggregated_holdings table
-- Purpose: Cache aggregated position data across multiple accounts for performance
-- Author: Portfolio Aggregation Pivot  
-- Date: 2025-01-13

-- Create aggregated holdings cache table
CREATE TABLE public.user_aggregated_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Security identification
    symbol TEXT NOT NULL,
    security_id TEXT, -- CUSIP, ISIN, or other unique identifier
    security_name TEXT,
    security_type TEXT CHECK (security_type IN ('equity', 'bond', 'etf', 'mutual_fund', 'option', 'cash', 'crypto', 'other')),
    
    -- Aggregated position data (using DECIMAL for financial precision)
    total_quantity DECIMAL(20, 8) DEFAULT 0,
    total_market_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    average_cost_basis DECIMAL(20, 8) DEFAULT 0,
    
    -- Performance metrics
    unrealized_gain_loss DECIMAL(20, 2) DEFAULT 0,
    unrealized_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    day_change_value DECIMAL(20, 2) DEFAULT 0,
    day_change_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Account breakdown (JSON structure for flexibility)
    account_contributions JSONB DEFAULT '[]', -- Array of {account_id, quantity, market_value, cost_basis, institution}
    institution_breakdown JSONB DEFAULT '{}', -- {institution_name: {quantity, value}}
    account_count INTEGER DEFAULT 1,
    
    -- Data freshness and metadata
    last_updated TIMESTAMPTZ DEFAULT now(),
    price_as_of TIMESTAMPTZ,
    data_source TEXT DEFAULT 'aggregated', -- 'plaid', 'alpaca', 'manual', 'aggregated'
    
    -- Constraints
    UNIQUE(user_id, symbol),
    CHECK (total_quantity >= 0),
    CHECK (total_market_value >= 0),
    CHECK (total_cost_basis >= 0),
    CHECK (account_count > 0)
);

-- Create indexes for performance
CREATE INDEX idx_aggregated_holdings_user_id ON public.user_aggregated_holdings(user_id);
CREATE INDEX idx_aggregated_holdings_symbol ON public.user_aggregated_holdings(symbol);
CREATE INDEX idx_aggregated_holdings_user_updated ON public.user_aggregated_holdings(user_id, last_updated DESC);
CREATE INDEX idx_aggregated_holdings_value ON public.user_aggregated_holdings(user_id, total_market_value DESC) 
    WHERE total_market_value > 0;
CREATE INDEX idx_aggregated_holdings_type ON public.user_aggregated_holdings(user_id, security_type);

-- GIN indexes for JSONB queries (efficient JSON querying)
CREATE INDEX idx_aggregated_holdings_contributions ON public.user_aggregated_holdings 
    USING GIN(account_contributions);
CREATE INDEX idx_aggregated_holdings_institutions ON public.user_aggregated_holdings 
    USING GIN(institution_breakdown);

-- Row Level Security
ALTER TABLE public.user_aggregated_holdings ENABLE ROW LEVEL SECURITY;

-- SECURITY FIX: RLS Policy with WITH CHECK clause to prevent users from creating/updating records for other users
-- Without WITH CHECK, the USING clause only applies to SELECT/UPDATE/DELETE, allowing unauthorized INSERTs
CREATE POLICY "Users can view their aggregated holdings" 
    ON public.user_aggregated_holdings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create trigger to automatically update updated_at column
CREATE TRIGGER update_aggregated_holdings_updated_at 
    BEFORE UPDATE ON public.user_aggregated_holdings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE public.user_aggregated_holdings IS 'Cached aggregated investment positions across all connected accounts';
COMMENT ON COLUMN public.user_aggregated_holdings.symbol IS 'Ticker symbol or security identifier for aggregation';
COMMENT ON COLUMN public.user_aggregated_holdings.account_contributions IS 'JSON array of account-level position details';
COMMENT ON COLUMN public.user_aggregated_holdings.institution_breakdown IS 'JSON object mapping institutions to position values';
COMMENT ON COLUMN public.user_aggregated_holdings.data_source IS 'Source of the data: plaid, alpaca, or aggregated calculation';

-- Create function to refresh aggregated holdings for a user
CREATE OR REPLACE FUNCTION refresh_user_aggregated_holdings(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete existing aggregated holdings for user (will be recalculated)
    DELETE FROM public.user_aggregated_holdings WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Note: Actual aggregation will be handled by application logic
    -- This function provides a clean slate for recalculation
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users for their own data
CREATE POLICY "Users can refresh their own aggregated holdings" 
    ON public.user_aggregated_holdings
    FOR DELETE
    USING (auth.uid() = user_id);

-- Verify table creation
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_aggregated_holdings'
ORDER BY ordinal_position;
