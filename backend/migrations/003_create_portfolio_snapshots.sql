-- Migration 003: Create user_portfolio_snapshots table  
-- Purpose: Track portfolio value over time for performance calculations and historical analysis
-- Author: Portfolio Aggregation Pivot
-- Date: 2025-01-13

-- Create portfolio snapshots table for historical performance tracking
CREATE TABLE public.user_portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Snapshot timing
    snapshot_date DATE NOT NULL,
    snapshot_type TEXT DEFAULT 'daily' CHECK (snapshot_type IN ('daily', 'weekly', 'monthly', 'manual')),
    
    -- Aggregated portfolio metrics (using DECIMAL for financial precision)
    total_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Account and provider breakdown
    account_count INTEGER DEFAULT 0,
    provider_breakdown JSONB DEFAULT '{}', -- {provider: {accounts: count, value: amount}}
    account_type_breakdown JSONB DEFAULT '{}', -- {account_type: value}
    
    -- Market context for benchmarking
    sp500_value DECIMAL(10, 2), -- S&P 500 close for benchmark comparison
    nasdaq_value DECIMAL(10, 2), -- NASDAQ close
    market_data JSONB DEFAULT '{}', -- Additional market context
    
    -- Portfolio composition summary
    top_holdings JSONB DEFAULT '[]', -- Top 10 holdings snapshot: [{symbol, value, percent}]
    sector_allocation JSONB DEFAULT '{}', -- Sector breakdown: {sector: percentage}
    asset_allocation JSONB DEFAULT '{}', -- Asset class breakdown: {asset_class: percentage}
    
    -- Data quality and metadata
    data_completeness_score DECIMAL(5, 2) DEFAULT 100.00, -- Percentage of accounts successfully synced
    providers_synced TEXT[] DEFAULT '{}', -- Array of providers that contributed data
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id, snapshot_date, snapshot_type),
    CHECK (total_value >= 0),
    CHECK (total_cost_basis >= 0),
    CHECK (account_count >= 0),
    CHECK (data_completeness_score >= 0 AND data_completeness_score <= 100)
);

-- Create indexes for performance
CREATE INDEX idx_portfolio_snapshots_user_date ON public.user_portfolio_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_portfolio_snapshots_date ON public.user_portfolio_snapshots(snapshot_date);
CREATE INDEX idx_portfolio_snapshots_type ON public.user_portfolio_snapshots(snapshot_type, snapshot_date);
CREATE INDEX idx_portfolio_snapshots_user_type ON public.user_portfolio_snapshots(user_id, snapshot_type, snapshot_date DESC);

-- GIN indexes for efficient JSONB queries
CREATE INDEX idx_portfolio_snapshots_providers ON public.user_portfolio_snapshots 
    USING GIN(provider_breakdown);
CREATE INDEX idx_portfolio_snapshots_sectors ON public.user_portfolio_snapshots 
    USING GIN(sector_allocation);
CREATE INDEX idx_portfolio_snapshots_assets ON public.user_portfolio_snapshots 
    USING GIN(asset_allocation);
CREATE INDEX idx_portfolio_snapshots_holdings ON public.user_portfolio_snapshots 
    USING GIN(top_holdings);

-- Row Level Security
ALTER TABLE public.user_portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own portfolio snapshots
CREATE POLICY "Users can view their portfolio snapshots" 
    ON public.user_portfolio_snapshots
    FOR ALL
    USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE public.user_portfolio_snapshots IS 'Historical portfolio snapshots for performance tracking and analysis';
COMMENT ON COLUMN public.user_portfolio_snapshots.snapshot_type IS 'Type of snapshot: daily (automated), weekly, monthly, or manual';
COMMENT ON COLUMN public.user_portfolio_snapshots.provider_breakdown IS 'JSON breakdown of portfolio value by provider';
COMMENT ON COLUMN public.user_portfolio_snapshots.top_holdings IS 'JSON array of top 10 holdings at snapshot time';
COMMENT ON COLUMN public.user_portfolio_snapshots.data_completeness_score IS 'Percentage of accounts that successfully synced for this snapshot';

-- Create function to create daily portfolio snapshot
CREATE OR REPLACE FUNCTION create_daily_portfolio_snapshot(
    target_user_id UUID,
    portfolio_value DECIMAL(20, 2),
    cost_basis DECIMAL(20, 2),
    account_count INTEGER,
    provider_data JSONB DEFAULT '{}',
    top_holdings_data JSONB DEFAULT '[]'
)
RETURNS UUID AS $$
DECLARE
    snapshot_id UUID;
    gain_loss DECIMAL(20, 2);
    gain_loss_percent DECIMAL(10, 4);
BEGIN
    -- Calculate performance metrics
    gain_loss := portfolio_value - cost_basis;
    gain_loss_percent := CASE 
        WHEN cost_basis > 0 THEN (gain_loss / cost_basis) * 100
        ELSE 0
    END;
    
    -- Insert snapshot record
    INSERT INTO public.user_portfolio_snapshots (
        user_id,
        snapshot_date,
        snapshot_type,
        total_value,
        total_cost_basis,
        total_gain_loss,
        total_gain_loss_percent,
        account_count,
        provider_breakdown,
        top_holdings
    ) VALUES (
        target_user_id,
        CURRENT_DATE,
        'daily',
        portfolio_value,
        cost_basis,
        gain_loss,
        gain_loss_percent,
        account_count,
        provider_data,
        top_holdings_data
    )
    ON CONFLICT (user_id, snapshot_date, snapshot_type)
    DO UPDATE SET
        total_value = EXCLUDED.total_value,
        total_cost_basis = EXCLUDED.total_cost_basis,
        total_gain_loss = EXCLUDED.total_gain_loss,
        total_gain_loss_percent = EXCLUDED.total_gain_loss_percent,
        account_count = EXCLUDED.account_count,
        provider_breakdown = EXCLUDED.provider_breakdown,
        top_holdings = EXCLUDED.top_holdings,
        updated_at = now()
    RETURNING id INTO snapshot_id;
    
    RETURN snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (will be called by backend service)
REVOKE ALL ON FUNCTION create_daily_portfolio_snapshot FROM PUBLIC;
-- Note: Backend service will call this function with appropriate user validation

-- Verify table creation and show structure
SELECT 
    'user_investment_accounts' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_investment_accounts'
UNION ALL
SELECT 
    'user_portfolio_snapshots' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'user_portfolio_snapshots';
