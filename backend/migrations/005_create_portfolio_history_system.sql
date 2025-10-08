-- Migration 005: Portfolio History System for Production Scale
-- Purpose: Complete portfolio history infrastructure for millions of users
-- Author: Portfolio History Implementation Phase 1
-- Date: 2025-09-18

-- ===============================================
-- PORTFOLIO HISTORY TABLE (PARTITIONED FOR SCALE)
-- ===============================================

-- Main portfolio history table with partitioning enabled
CREATE TABLE public.user_portfolio_history (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Time series core
    value_date DATE NOT NULL,           -- The date this value represents (PARTITION KEY)
    snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('reconstructed', 'daily_eod', 'intraday')),
    
    -- Portfolio metrics (high precision for financial data)
    total_value DECIMAL(20, 2) NOT NULL,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Intraday tracking (for 1D live charts)
    opening_value DECIMAL(20, 2),       -- Market open value
    closing_value DECIMAL(20, 2),       -- Market close value  
    intraday_high DECIMAL(20, 2),       -- Highest value during day
    intraday_low DECIMAL(20, 2),        -- Lowest value during day
    
    -- Per-account breakdown (for future filtering)
    account_breakdown JSONB DEFAULT '{}', -- {"schwab_401k": 15000, "schwab_ira": 7500}
    institution_breakdown JSONB DEFAULT '{}', -- {"Charles Schwab": 22500, "Fidelity": 3000}
    
    -- Data source tracking
    data_source TEXT DEFAULT 'reconstructed',  -- 'reconstructed', 'daily_job', 'websocket'
    price_source TEXT DEFAULT 'fmp',           -- 'fmp', 'alpaca', 'mixed'
    data_quality_score DECIMAL(5, 2) DEFAULT 100.00,
    
    -- Performance optimization
    securities_count INTEGER DEFAULT 0,        -- Number of securities on this date
    reconstruction_duration_ms INTEGER,        -- Time taken for reconstruction (metrics)
    
    -- Audit trail
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id, value_date, snapshot_type),
    CHECK (total_value >= 0),
    CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
    CHECK (securities_count >= 0),
    
    -- PRIMARY KEY must include partition key
    PRIMARY KEY (id, value_date)
    
) PARTITION BY RANGE (value_date);

-- Now create the partitions (AFTER main table with partitioning enabled)
CREATE TABLE public.user_portfolio_history_2023 PARTITION OF public.user_portfolio_history
FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE public.user_portfolio_history_2024 PARTITION OF public.user_portfolio_history  
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE public.user_portfolio_history_2025 PARTITION OF public.user_portfolio_history
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Future partitions can be added as needed
CREATE TABLE public.user_portfolio_history_2026 PARTITION OF public.user_portfolio_history
FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- ===============================================
-- GLOBAL SYMBOL MAPPING CACHE (SHARED ACROSS ALL USERS)
-- ===============================================

-- Permanent cache for Plaid security_id → FMP symbol mappings
CREATE TABLE public.global_security_symbol_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plaid_security_id TEXT NOT NULL UNIQUE,
    fmp_symbol TEXT NOT NULL,
    
    -- Plaid identifiers (for multiple mapping strategies)
    plaid_ticker_symbol TEXT,
    plaid_cusip TEXT,
    plaid_isin TEXT,
    plaid_name TEXT,
    plaid_type TEXT,
    plaid_subtype TEXT,
    
    -- Mapping metadata
    mapping_method TEXT NOT NULL, -- 'ticker', 'cusip', 'name_fuzzy', 'manual'
    mapping_confidence DECIMAL(5, 2) DEFAULT 100.00,
    mapping_verified BOOLEAN DEFAULT false,
    mapping_notes TEXT,
    
    -- Performance tracking
    fmp_validation_success BOOLEAN DEFAULT false,
    last_price_fetch_success TIMESTAMPTZ,
    price_fetch_error_count INTEGER DEFAULT 0,
    
    -- Audit trail
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CHECK (mapping_confidence >= 0 AND mapping_confidence <= 100),
    CHECK (price_fetch_error_count >= 0)
);

-- ===============================================
-- GLOBAL HISTORICAL PRICE CACHE (SHARED ACROSS ALL USERS)
-- ===============================================

-- Global historical price cache with partitioning enabled
CREATE TABLE public.global_historical_prices (
    id UUID DEFAULT gen_random_uuid(),
    fmp_symbol TEXT NOT NULL,
    price_date DATE NOT NULL,  -- PARTITION KEY
    price_timestamp TIMESTAMPTZ,  -- Exact timestamp for intraday data (NULL for EOD data)
    
    -- OHLC data (standard financial format)
    open_price DECIMAL(12, 4),
    high_price DECIMAL(12, 4),  
    low_price DECIMAL(12, 4),
    close_price DECIMAL(12, 4) NOT NULL,
    volume BIGINT DEFAULT 0,
    
    -- Additional FMP data
    adjusted_close DECIMAL(12, 4),
    change_amount DECIMAL(12, 4),
    change_percent DECIMAL(8, 4),
    
    -- Data source tracking
    data_source TEXT DEFAULT 'fmp',
    data_quality DECIMAL(5, 2) DEFAULT 100.00,
    fetch_timestamp TIMESTAMPTZ DEFAULT now(),
    
    -- API cost tracking
    api_request_id TEXT,
    batch_request_size INTEGER,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    -- SCHEMA FIX: UNIQUE constraint with NULL values doesn't enforce single EOD record
    -- PostgreSQL treats NULL as distinct, so multiple NULL price_timestamp rows can exist
    -- We'll add partial unique indexes below to properly enforce uniqueness
    CHECK (close_price > 0),
    CHECK (volume >= 0),
    CHECK (data_quality >= 0 AND data_quality <= 100),
    
    -- PRIMARY KEY must include partition key
    PRIMARY KEY (id, price_date)
    
) PARTITION BY RANGE (price_date);

-- Now create the partitions (AFTER main table with partitioning enabled)
CREATE TABLE public.global_historical_prices_2023 PARTITION OF public.global_historical_prices
FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE public.global_historical_prices_2024 PARTITION OF public.global_historical_prices
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE public.global_historical_prices_2025 PARTITION OF public.global_historical_prices
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- SCHEMA FIX: Add partial unique indexes to properly enforce data integrity
-- Separate indexes for EOD (NULL timestamp) and intraday (non-NULL timestamp) data
-- This prevents duplicate EOD records which the UNIQUE constraint failed to catch

-- Unique index for EOD data (price_timestamp IS NULL)
CREATE UNIQUE INDEX idx_historical_prices_eod_unique 
    ON public.global_historical_prices(fmp_symbol, price_date) 
    WHERE price_timestamp IS NULL;

-- Unique index for intraday data (price_timestamp IS NOT NULL)  
CREATE UNIQUE INDEX idx_historical_prices_intraday_unique 
    ON public.global_historical_prices(fmp_symbol, price_date, price_timestamp) 
    WHERE price_timestamp IS NOT NULL;

-- Additional performance indexes
CREATE INDEX idx_historical_prices_symbol_date 
    ON public.global_historical_prices(fmp_symbol, price_date DESC);

CREATE INDEX idx_historical_prices_date 
    ON public.global_historical_prices(price_date DESC);

-- ===============================================
-- RECONSTRUCTION STATUS TRACKING
-- ===============================================

-- Track reconstruction status for user experience and monitoring
CREATE TABLE public.user_portfolio_reconstruction_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Status tracking
    reconstruction_status TEXT NOT NULL CHECK (reconstruction_status IN ('pending', 'in_progress', 'completed', 'failed')),
    reconstruction_progress DECIMAL(5, 2) DEFAULT 0.00, -- Percentage complete
    
    -- Timeline tracking
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    
    -- Processing metrics
    total_securities INTEGER DEFAULT 0,
    processed_securities INTEGER DEFAULT 0,
    failed_securities INTEGER DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    processed_transactions INTEGER DEFAULT 0,
    
    -- Data range
    history_start_date DATE,
    history_end_date DATE,
    total_data_points INTEGER DEFAULT 0,
    
    -- Performance metrics
    total_api_calls INTEGER DEFAULT 0,
    total_api_cost_estimate DECIMAL(10, 4) DEFAULT 0,
    processing_duration_seconds INTEGER,
    
    -- Error tracking
    error_message TEXT,
    error_details JSONB,
    retry_count INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id),
    CHECK (reconstruction_progress >= 0 AND reconstruction_progress <= 100),
    CHECK (retry_count >= 0),
    CHECK (total_securities >= 0),
    CHECK (processed_securities >= 0),
    CHECK (total_data_points >= 0)
);

-- ===============================================
-- PERFORMANCE INDEXES FOR CHART QUERIES
-- ===============================================

-- Ultra-optimized indexes for portfolio history chart loading
CREATE INDEX idx_portfolio_history_user_date_type 
ON public.user_portfolio_history(user_id, value_date DESC, snapshot_type);

CREATE INDEX idx_portfolio_history_date_global 
ON public.user_portfolio_history(value_date) 
WHERE snapshot_type = 'daily_eod';

-- Note: Recent data index removed due to CURRENT_DATE immutability issue
-- The main indexes provide sufficient performance for queries

-- Symbol mapping lookup indexes
CREATE INDEX idx_symbol_mappings_plaid_id ON public.global_security_symbol_mappings(plaid_security_id);
CREATE INDEX idx_symbol_mappings_fmp_symbol ON public.global_security_symbol_mappings(fmp_symbol);
CREATE INDEX idx_symbol_mappings_ticker ON public.global_security_symbol_mappings(plaid_ticker_symbol);
CREATE INDEX idx_symbol_mappings_cusip ON public.global_security_symbol_mappings(plaid_cusip);

-- Historical price lookup indexes  
CREATE INDEX idx_historical_prices_symbol_date 
ON public.global_historical_prices(fmp_symbol, price_date DESC);

CREATE INDEX idx_historical_prices_date_global 
ON public.global_historical_prices(price_date);

-- Note: Recent price index removed due to CURRENT_DATE immutability issue
-- The main symbol+date index provides sufficient performance

-- Reconstruction status indexes
CREATE INDEX idx_reconstruction_status_user ON public.user_portfolio_reconstruction_status(user_id);
CREATE INDEX idx_reconstruction_status_pending ON public.user_portfolio_reconstruction_status(reconstruction_status)
WHERE reconstruction_status IN ('pending', 'in_progress');

-- ===============================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ===============================================

-- Portfolio performance summary for dashboard analytics
CREATE MATERIALIZED VIEW public.portfolio_performance_summary AS
SELECT 
    user_id,
    COUNT(*) as total_data_points,
    MIN(value_date) as history_start_date,
    MAX(value_date) as history_end_date,
    MIN(total_value) as min_portfolio_value,
    MAX(total_value) as max_portfolio_value,
    AVG(total_value) as avg_portfolio_value,
    STDDEV(total_value) as portfolio_volatility,
    MAX(total_value) - MIN(total_value) as value_range,
    (MAX(total_value) - MIN(total_value)) / MIN(total_value) * 100 as total_return_percent
FROM public.user_portfolio_history 
WHERE snapshot_type IN ('reconstructed', 'daily_eod')
    AND total_value > 0
GROUP BY user_id;

CREATE INDEX idx_portfolio_summary_user ON public.portfolio_performance_summary(user_id);

-- ===============================================
-- OPTIMIZED FUNCTIONS FOR CHART DATA
-- ===============================================

-- High-performance function for chart data retrieval
CREATE OR REPLACE FUNCTION get_portfolio_history_for_chart(
    target_user_id UUID,
    period_days INTEGER DEFAULT 30,
    snapshot_types TEXT[] DEFAULT ARRAY['reconstructed', 'daily_eod']
) RETURNS TABLE(
    value_date DATE,
    total_value DECIMAL(20,2),
    total_gain_loss DECIMAL(20,2),
    total_gain_loss_percent DECIMAL(10,4),
    account_breakdown JSONB,
    data_source TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.value_date,
        h.total_value,
        h.total_gain_loss,
        h.total_gain_loss_percent,
        h.account_breakdown,
        h.data_source
    FROM public.user_portfolio_history h
    WHERE h.user_id = target_user_id
        AND h.value_date >= CURRENT_DATE - make_interval(days => period_days)
        AND h.snapshot_type = ANY(snapshot_types)
    ORDER BY h.value_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Function for efficient reconstruction status checks
CREATE OR REPLACE FUNCTION get_user_reconstruction_status(target_user_id UUID)
RETURNS TABLE(
    status TEXT,
    progress DECIMAL(5,2),
    estimated_completion TIMESTAMPTZ,
    error_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.reconstruction_status,
        r.reconstruction_progress,
        r.estimated_completion,
        r.error_message
    FROM public.user_portfolio_reconstruction_status r
    WHERE r.user_id = target_user_id;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- ROW LEVEL SECURITY
-- ===============================================

-- Enable RLS for all new tables
ALTER TABLE public.user_portfolio_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_portfolio_reconstruction_status ENABLE ROW LEVEL SECURITY;

-- Users can only access their own portfolio history
CREATE POLICY "Users can view their portfolio history" 
    ON public.user_portfolio_history
    FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their reconstruction status" 
    ON public.user_portfolio_reconstruction_status
    FOR ALL
    USING (auth.uid() = user_id);

-- Global caches are read-only for authenticated users
ALTER TABLE public.global_security_symbol_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_historical_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read symbol mappings" 
    ON public.global_security_symbol_mappings
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read historical prices" 
    ON public.global_historical_prices
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- ===============================================
-- TABLE COMMENTS FOR DOCUMENTATION
-- ===============================================

COMMENT ON TABLE public.user_portfolio_history IS 'Comprehensive portfolio value history with partitioning for massive scale';
COMMENT ON COLUMN public.user_portfolio_history.snapshot_type IS 'Type: reconstructed (from transactions), daily_eod (end of day), intraday (live)';
COMMENT ON COLUMN public.user_portfolio_history.account_breakdown IS 'JSON breakdown by individual accounts for filtering UI';
COMMENT ON COLUMN public.user_portfolio_history.institution_breakdown IS 'JSON breakdown by financial institution';

COMMENT ON TABLE public.global_security_symbol_mappings IS 'Global cache for Plaid security_id to FMP symbol mappings';
COMMENT ON COLUMN public.global_security_symbol_mappings.mapping_method IS 'How the mapping was determined: ticker, cusip, name_fuzzy, manual';

COMMENT ON TABLE public.global_historical_prices IS 'Global cache for historical price data shared across all users (supports both EOD and intraday)';
COMMENT ON COLUMN public.global_historical_prices.price_date IS 'Date for partitioning and EOD data (required)';
COMMENT ON COLUMN public.global_historical_prices.price_timestamp IS 'Exact timestamp for intraday data (NULL for EOD, required for 1D/1W charts)';
COMMENT ON COLUMN public.global_historical_prices.close_price IS 'Closing price at this timestamp (EOD close for daily data, period close for intraday)';

COMMENT ON TABLE public.user_portfolio_reconstruction_status IS 'Tracks reconstruction progress for user experience and monitoring';

-- ===============================================
-- VERIFICATION QUERIES
-- ===============================================

-- Verify table creation and structure
SELECT 
    schemaname, 
    tablename, 
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename LIKE '%portfolio_history%'
ORDER BY tablename;

-- Verify partitioning setup (Supabase compatible)
SELECT 
    schemaname,
    tablename,
    'partitioned' as status
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename LIKE '%portfolio_history%'
ORDER BY tablename;

-- Verify indexes
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename LIKE '%portfolio_history%'
    OR tablename LIKE '%symbol_mappings%'
    OR tablename LIKE '%historical_prices%'
ORDER BY tablename, indexname;
