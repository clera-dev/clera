# Database Migration Strategy: Portfolio Aggregation Pivot

## Overview
This document provides comprehensive database migration strategies to support the pivot from single Alpaca brokerage accounts to multi-provider portfolio aggregation, while preserving existing data and maintaining backward compatibility.

## Migration Philosophy

### Additive Migration Approach
- **Preserve all existing data** - No destructive changes to current tables
- **Maintain backward compatibility** - Existing queries continue to work
- **Zero downtime deployment** - Migrations can be applied without service interruption
- **Rollback capability** - All changes can be reverted if needed

### Migration Timeline
1. **Phase 1**: Add new tables and columns (Week 1)
2. **Phase 2**: Data population and validation (Week 2-3) 
3. **Phase 3**: Application cutover and cleanup (Week 4+)

---

## Current Database State Analysis

### Existing Tables (Preserve)
```sql
-- Core authentication (Supabase managed)
auth.users
auth.sessions

-- Current onboarding table  
public.user_onboarding (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    onboarding_data JSONB,
    status TEXT,
    alpaca_account_id TEXT,
    alpaca_account_number TEXT,
    alpaca_account_status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Bank connections (Plaid for ACH funding only)
public.user_bank_connections (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    alpaca_account_id TEXT,
    relationship_id TEXT,
    bank_name TEXT,
    bank_account_type TEXT,
    last_4 TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ACH transfers
public.user_transfers (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    alpaca_account_id TEXT,
    relationship_id TEXT,
    transfer_id TEXT,
    amount DECIMAL(15, 2),
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- User personalization
public.user_personalization (
    id UUID PRIMARY KEY,
    user_id UUID,
    first_name TEXT,
    investment_goals TEXT[],
    risk_tolerance TEXT,
    investment_timeline TEXT,
    experience_level TEXT,
    monthly_investment_goal INTEGER,
    market_interests TEXT[],
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

---

## Migration Phase 1: New Table Creation

### Migration 1.1: Investment Accounts Table
```sql
-- File: migrations/001_create_investment_accounts.sql
-- Purpose: Support multiple investment accounts from various providers

CREATE TABLE public.user_investment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Provider information
    provider TEXT NOT NULL CHECK (provider IN ('plaid', 'alpaca', 'manual')),
    provider_account_id TEXT NOT NULL,
    provider_item_id TEXT, -- Plaid item ID or similar
    
    -- Account details
    institution_id TEXT, -- Plaid institution ID
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
CREATE INDEX idx_investment_accounts_sync_status ON public.user_investment_accounts(sync_status, last_synced) WHERE sync_enabled = true;

-- Row Level Security
ALTER TABLE public.user_investment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their investment accounts" ON public.user_investment_accounts
    FOR ALL 
    USING (auth.uid() = user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_investment_accounts_updated_at 
    BEFORE UPDATE ON public.user_investment_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 1.2: Aggregated Holdings Cache Table  
```sql
-- File: migrations/002_create_aggregated_holdings.sql
-- Purpose: Cache aggregated position data for performance

CREATE TABLE public.user_aggregated_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Security identification
    symbol TEXT NOT NULL,
    security_id TEXT, -- CUSIP, ISIN, or other unique identifier
    security_name TEXT,
    security_type TEXT, -- 'equity', 'bond', 'etf', 'mutual_fund', 'crypto', 'option', 'cash'
    
    -- Aggregated position data
    total_quantity DECIMAL(20, 8) DEFAULT 0,
    total_market_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    average_cost_basis DECIMAL(20, 8) DEFAULT 0,
    
    -- Performance metrics
    unrealized_gain_loss DECIMAL(20, 2) DEFAULT 0,
    unrealized_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    day_change_value DECIMAL(20, 2) DEFAULT 0,
    day_change_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Account breakdown
    account_contributions JSONB DEFAULT '[]', -- Array of {account_id, quantity, market_value, cost_basis}
    institution_breakdown JSONB DEFAULT '{}', -- {institution_name: {quantity, value}}
    account_count INTEGER DEFAULT 1,
    
    -- Metadata
    last_updated TIMESTAMPTZ DEFAULT now(),
    price_as_of TIMESTAMPTZ,
    data_source TEXT DEFAULT 'aggregated', -- 'plaid', 'alpaca', 'manual', 'aggregated'
    
    -- Constraints
    UNIQUE(user_id, symbol),
    CHECK (total_quantity >= 0),
    CHECK (account_count > 0)
);

-- Create indexes
CREATE INDEX idx_aggregated_holdings_user_id ON public.user_aggregated_holdings(user_id);
CREATE INDEX idx_aggregated_holdings_symbol ON public.user_aggregated_holdings(symbol);
CREATE INDEX idx_aggregated_holdings_user_updated ON public.user_aggregated_holdings(user_id, last_updated DESC);
CREATE INDEX idx_aggregated_holdings_value ON public.user_aggregated_holdings(user_id, total_market_value DESC) WHERE total_market_value > 0;

-- GIN index for JSONB queries
CREATE INDEX idx_aggregated_holdings_contributions ON public.user_aggregated_holdings USING GIN(account_contributions);
CREATE INDEX idx_aggregated_holdings_institutions ON public.user_aggregated_holdings USING GIN(institution_breakdown);

-- Row Level Security  
ALTER TABLE public.user_aggregated_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their aggregated holdings" ON public.user_aggregated_holdings
    FOR ALL
    USING (auth.uid() = user_id);

-- Update trigger
CREATE TRIGGER update_aggregated_holdings_updated_at 
    BEFORE UPDATE ON public.user_aggregated_holdings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 1.3: Portfolio Snapshots for Historical Tracking
```sql
-- File: migrations/003_create_portfolio_snapshots.sql  
-- Purpose: Track portfolio value over time for performance calculations

CREATE TABLE public.user_portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Snapshot timing
    snapshot_date DATE NOT NULL,
    snapshot_type TEXT DEFAULT 'daily' CHECK (snapshot_type IN ('daily', 'weekly', 'monthly', 'manual')),
    
    -- Aggregated portfolio metrics
    total_value DECIMAL(20, 2) DEFAULT 0,
    total_cost_basis DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss DECIMAL(20, 2) DEFAULT 0,
    total_gain_loss_percent DECIMAL(10, 4) DEFAULT 0,
    
    -- Account breakdown
    account_count INTEGER DEFAULT 0,
    provider_breakdown JSONB DEFAULT '{}', -- {provider: {accounts: count, value: amount}}
    account_type_breakdown JSONB DEFAULT '{}', -- {account_type: value}
    
    -- Market context
    sp500_value DECIMAL(10, 2), -- S&P 500 close for benchmark comparison
    market_data JSONB DEFAULT '{}', -- Additional market context
    
    -- Portfolio composition
    top_holdings JSONB DEFAULT '[]', -- Top 10 holdings for this date
    sector_allocation JSONB DEFAULT '{}', -- Sector breakdown
    asset_allocation JSONB DEFAULT '{}', -- Asset class breakdown
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id, snapshot_date, snapshot_type),
    CHECK (total_value >= 0),
    CHECK (account_count >= 0)
);

-- Create indexes
CREATE INDEX idx_portfolio_snapshots_user_date ON public.user_portfolio_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_portfolio_snapshots_date ON public.user_portfolio_snapshots(snapshot_date);
CREATE INDEX idx_portfolio_snapshots_type ON public.user_portfolio_snapshots(snapshot_type, snapshot_date);

-- GIN indexes for JSONB queries
CREATE INDEX idx_portfolio_snapshots_providers ON public.user_portfolio_snapshots USING GIN(provider_breakdown);
CREATE INDEX idx_portfolio_snapshots_sectors ON public.user_portfolio_snapshots USING GIN(sector_allocation);

-- Row Level Security
ALTER TABLE public.user_portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their portfolio snapshots" ON public.user_portfolio_snapshots
    FOR ALL
    USING (auth.uid() = user_id);
```

### Migration 1.4: Transaction History Table
```sql
-- File: migrations/004_create_investment_transactions.sql
-- Purpose: Store investment transactions across all providers

CREATE TABLE public.user_investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.user_investment_accounts(id) ON DELETE CASCADE,
    
    -- Transaction identification
    provider_transaction_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    
    -- Security details
    symbol TEXT,
    security_id TEXT,
    security_name TEXT,
    security_type TEXT,
    
    -- Transaction details
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 
        'transfer_in', 'transfer_out', 'deposit', 'withdrawal',
        'split', 'merger', 'spinoff', 'other'
    )),
    transaction_date DATE NOT NULL,
    settlement_date DATE,
    
    -- Financial details
    quantity DECIMAL(20, 8) DEFAULT 0,
    price DECIMAL(20, 8) DEFAULT 0,
    amount DECIMAL(20, 2) NOT NULL, -- Negative for outflows, positive for inflows
    fees DECIMAL(20, 2) DEFAULT 0,
    currency_code TEXT DEFAULT 'USD',
    
    -- Context
    description TEXT,
    category TEXT, -- Provider-specific category
    subcategory TEXT,
    
    -- Metadata
    raw_transaction_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(account_id, provider_transaction_id),
    CHECK (price >= 0),
    CHECK (fees >= 0)
);

-- Create indexes
CREATE INDEX idx_investment_transactions_user_id ON public.user_investment_transactions(user_id);
CREATE INDEX idx_investment_transactions_account ON public.user_investment_transactions(account_id, transaction_date DESC);
CREATE INDEX idx_investment_transactions_symbol ON public.user_investment_transactions(symbol, transaction_date DESC) WHERE symbol IS NOT NULL;
CREATE INDEX idx_investment_transactions_type_date ON public.user_investment_transactions(transaction_type, transaction_date DESC);
CREATE INDEX idx_investment_transactions_date ON public.user_investment_transactions(transaction_date DESC);

-- Row Level Security
ALTER TABLE public.user_investment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their investment transactions" ON public.user_investment_transactions
    FOR ALL
    USING (auth.uid() = user_id);
```

---

## Migration Phase 2: Data Population and Validation

### Migration 2.1: Populate Investment Accounts from Existing Data
```sql
-- File: migrations/005_populate_investment_accounts.sql
-- Purpose: Migrate existing Alpaca accounts to new multi-provider structure

-- Insert existing Alpaca accounts
INSERT INTO public.user_investment_accounts (
    user_id,
    provider,
    provider_account_id,
    institution_name,
    account_name,
    account_type,
    is_active,
    is_primary,
    sync_status,
    last_synced,
    created_at,
    updated_at
)
SELECT 
    user_id,
    'alpaca' as provider,
    COALESCE(alpaca_account_id, alpaca_account_number) as provider_account_id,
    'Alpaca Securities' as institution_name,
    'Alpaca Brokerage Account' as account_name,
    'brokerage' as account_type,
    CASE 
        WHEN alpaca_account_status = 'ACTIVE' THEN true 
        ELSE false 
    END as is_active,
    true as is_primary, -- First account is primary
    CASE
        WHEN alpaca_account_status = 'ACTIVE' THEN 'success'
        WHEN alpaca_account_status IN ('PENDING', 'SUBMITTED') THEN 'pending'
        ELSE 'error'
    END as sync_status,
    updated_at as last_synced,
    created_at,
    updated_at
FROM public.user_onboarding 
WHERE alpaca_account_id IS NOT NULL 
   OR alpaca_account_number IS NOT NULL;

-- Log migration results
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count 
    FROM public.user_investment_accounts 
    WHERE provider = 'alpaca';
    
    RAISE NOTICE 'Migrated % Alpaca accounts to investment accounts table', migrated_count;
END $$;
```

### Migration 2.2: Create Views for Backward Compatibility
```sql
-- File: migrations/006_create_compatibility_views.sql
-- Purpose: Maintain backward compatibility with existing queries

-- View to maintain compatibility with existing portfolio queries
CREATE VIEW public.user_portfolio_legacy AS 
SELECT 
    uia.user_id,
    uia.provider_account_id as account_id,
    uia.institution_name,
    uia.account_name,
    uia.is_active,
    CASE WHEN uia.provider = 'alpaca' THEN 'ACTIVE' ELSE 'AGGREGATED' END as account_status
FROM public.user_investment_accounts uia
WHERE uia.is_active = true;

-- Grant appropriate permissions
GRANT SELECT ON public.user_portfolio_legacy TO authenticated;

-- View for aggregated holdings that maintains position structure
CREATE VIEW public.user_positions_aggregated AS
SELECT 
    uah.user_id,
    uah.symbol,
    uah.total_quantity as quantity,
    uah.total_market_value as market_value,
    uah.total_cost_basis as cost_basis,
    uah.average_cost_basis,
    uah.unrealized_gain_loss,
    uah.unrealized_gain_loss_percent,
    uah.day_change_value,
    uah.day_change_percent,
    uah.account_count,
    uah.last_updated
FROM public.user_aggregated_holdings uah
WHERE uah.total_quantity > 0;

GRANT SELECT ON public.user_positions_aggregated TO authenticated;
```

### Migration 2.3: Data Validation and Integrity Checks
```sql
-- File: migrations/007_data_validation.sql
-- Purpose: Validate data integrity after migration

-- Function to validate migration integrity
CREATE OR REPLACE FUNCTION validate_migration_integrity()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check 1: All users with onboarding data have investment accounts
    RETURN QUERY
    SELECT 
        'user_account_mapping'::TEXT,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'
            ELSE 'FAIL'
        END::TEXT,
        'Users missing investment accounts: ' || COUNT(*)::TEXT
    FROM public.user_onboarding uo
    LEFT JOIN public.user_investment_accounts uia ON uo.user_id = uia.user_id
    WHERE uo.alpaca_account_id IS NOT NULL 
      AND uia.id IS NULL;

    -- Check 2: No duplicate investment accounts per user/provider
    RETURN QUERY
    SELECT 
        'duplicate_accounts'::TEXT,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'
            ELSE 'FAIL'
        END::TEXT,
        'Duplicate accounts found: ' || COUNT(*)::TEXT
    FROM (
        SELECT user_id, provider, provider_account_id, COUNT(*) as count
        FROM public.user_investment_accounts
        GROUP BY user_id, provider, provider_account_id
        HAVING COUNT(*) > 1
    ) duplicates;

    -- Check 3: RLS policies are enabled
    RETURN QUERY
    SELECT 
        'rls_policies'::TEXT,
        CASE 
            WHEN COUNT(*) = 3 THEN 'PASS' -- 3 new tables should have RLS
            ELSE 'FAIL'
        END::TEXT,
        'Tables with RLS enabled: ' || COUNT(*)::TEXT
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' 
      AND c.relname IN ('user_investment_accounts', 'user_aggregated_holdings', 'user_portfolio_snapshots')
      AND c.relrowsecurity = true;

    -- Check 4: Indexes are created
    RETURN QUERY
    SELECT 
        'required_indexes'::TEXT,
        CASE 
            WHEN COUNT(*) >= 10 THEN 'PASS' -- Expect at least 10 indexes on new tables
            ELSE 'FAIL'
        END::TEXT,
        'Indexes created: ' || COUNT(*)::TEXT
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('user_investment_accounts', 'user_aggregated_holdings', 'user_portfolio_snapshots', 'user_investment_transactions');

END;
$$ LANGUAGE plpgsql;

-- Run validation
SELECT * FROM validate_migration_integrity();
```

---

## Migration Phase 3: Application Cutover Support

### Migration 3.1: Feature Flag Support in Database
```sql
-- File: migrations/008_feature_flags_support.sql
-- Purpose: Add database support for feature flags

-- Table to store user-specific feature flag overrides
CREATE TABLE public.user_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flag_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    reason TEXT, -- Why this override was set
    set_by TEXT, -- Who set this override (admin user, system, etc.)
    expires_at TIMESTAMPTZ, -- Optional expiration
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(user_id, flag_name)
);

-- Create indexes
CREATE INDEX idx_user_feature_flags_user ON public.user_feature_flags(user_id);
CREATE INDEX idx_user_feature_flags_flag ON public.user_feature_flags(flag_name, enabled);
CREATE INDEX idx_user_feature_flags_expiry ON public.user_feature_flags(expires_at) WHERE expires_at IS NOT NULL;

-- Row Level Security
ALTER TABLE public.user_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their feature flags" ON public.user_feature_flags
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only admins can modify feature flags (implement admin check as needed)
CREATE POLICY "Admins can manage feature flags" ON public.user_feature_flags
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin'); -- Adjust based on your admin implementation

-- Update trigger
CREATE TRIGGER update_user_feature_flags_updated_at 
    BEFORE UPDATE ON public.user_feature_flags 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Migration 3.2: Extend User Onboarding for Multi-Provider
```sql
-- File: migrations/009_extend_user_onboarding.sql
-- Purpose: Add fields to support multi-provider onboarding

-- Add new columns to existing user_onboarding table
ALTER TABLE public.user_onboarding 
ADD COLUMN IF NOT EXISTS onboarding_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS primary_provider TEXT DEFAULT 'alpaca',
ADD COLUMN IF NOT EXISTS account_aggregation_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS plaid_link_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aggregation_onboarded_at TIMESTAMPTZ;

-- Update existing records to reflect current state
UPDATE public.user_onboarding 
SET 
    onboarding_version = 1,
    primary_provider = 'alpaca',
    account_aggregation_enabled = false
WHERE onboarding_version IS NULL;

-- Create index for new columns
CREATE INDEX idx_user_onboarding_provider ON public.user_onboarding(primary_provider, account_aggregation_enabled);
```

---

## Rollback Procedures

### Emergency Rollback Script
```sql
-- File: rollback/emergency_rollback.sql
-- Purpose: Quick rollback of all migration changes

-- WARNING: This will drop all new tables and data
-- Only use in emergency situations with proper backups

BEGIN;

-- Drop new tables (in reverse dependency order)
DROP TABLE IF EXISTS public.user_feature_flags CASCADE;
DROP TABLE IF EXISTS public.user_investment_transactions CASCADE;  
DROP TABLE IF EXISTS public.user_portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS public.user_aggregated_holdings CASCADE;
DROP TABLE IF EXISTS public.user_investment_accounts CASCADE;

-- Drop views
DROP VIEW IF EXISTS public.user_positions_aggregated CASCADE;
DROP VIEW IF EXISTS public.user_portfolio_legacy CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS validate_migration_integrity() CASCADE;

-- Revert user_onboarding changes
ALTER TABLE public.user_onboarding 
DROP COLUMN IF EXISTS onboarding_version,
DROP COLUMN IF EXISTS primary_provider,
DROP COLUMN IF EXISTS account_aggregation_enabled,
DROP COLUMN IF EXISTS plaid_link_completed,
DROP COLUMN IF EXISTS aggregation_onboarded_at;

-- Log rollback
INSERT INTO public.migration_log (operation, description, executed_at)
VALUES ('ROLLBACK', 'Emergency rollback of portfolio aggregation migration', now());

COMMIT;
```

### Selective Rollback Procedures
```sql
-- File: rollback/selective_rollback.sql
-- Purpose: Rollback specific components while preserving others

-- Rollback only aggregated holdings (preserve accounts)
DROP TABLE IF EXISTS public.user_aggregated_holdings CASCADE;

-- Rollback only snapshots (preserve live data)
DROP TABLE IF EXISTS public.user_portfolio_snapshots CASCADE;

-- Rollback feature flags only
DROP TABLE IF EXISTS public.user_feature_flags CASCADE;
```

---

## Migration Monitoring and Logging

### Migration Log Table
```sql
-- File: migrations/000_migration_logging.sql
-- Purpose: Track all migration operations

CREATE TABLE IF NOT EXISTS public.migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_file TEXT NOT NULL,
    operation TEXT NOT NULL, -- 'CREATE', 'ALTER', 'INSERT', 'ROLLBACK'  
    description TEXT,
    executed_at TIMESTAMPTZ DEFAULT now(),
    executed_by TEXT DEFAULT current_user,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT
);

-- Create index
CREATE INDEX idx_migration_log_executed ON public.migration_log(executed_at DESC);
```

### Performance Monitoring
```sql
-- File: migrations/monitoring_views.sql
-- Purpose: Views for monitoring migration performance

-- View to monitor table sizes
CREATE VIEW public.table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View to monitor index usage
CREATE VIEW public.index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## Migration Execution Plan

### Pre-Migration Checklist
- [ ] **Backup Creation**: Full database backup created and verified
- [ ] **Test Environment**: All migrations tested in staging environment
- [ ] **Rollback Plan**: Rollback procedures tested and validated
- [ ] **Monitoring Setup**: Performance monitoring enabled
- [ ] **Team Notification**: Development team notified of migration window

### Migration Execution Steps

#### Step 1: Schema Changes (5 minutes)
```bash
# Execute schema migrations
psql -f migrations/001_create_investment_accounts.sql
psql -f migrations/002_create_aggregated_holdings.sql  
psql -f migrations/003_create_portfolio_snapshots.sql
psql -f migrations/004_create_investment_transactions.sql
```

#### Step 2: Data Population (10 minutes)
```bash
# Populate with existing data
psql -f migrations/005_populate_investment_accounts.sql
psql -f migrations/006_create_compatibility_views.sql
```

#### Step 3: Validation (5 minutes)
```bash
# Validate migration integrity
psql -f migrations/007_data_validation.sql
```

#### Step 4: Feature Support (5 minutes)
```bash
# Add feature flag support
psql -f migrations/008_feature_flags_support.sql
psql -f migrations/009_extend_user_onboarding.sql
```

### Post-Migration Checklist
- [ ] **Data Validation**: Run integrity checks and verify counts
- [ ] **Performance Check**: Monitor query performance on new tables
- [ ] **Application Testing**: Verify application works with new schema
- [ ] **RLS Verification**: Test row-level security policies
- [ ] **Index Monitoring**: Verify indexes are being used effectively

### Migration Timeline
- **Total Duration**: ~25 minutes
- **Downtime Required**: None (additive changes only)
- **Rollback Time**: ~5 minutes if needed
- **Validation Time**: ~10 minutes

---

## Production Migration Considerations

### Database Connection Management
- Use connection pooling during migration to handle increased load
- Monitor active connections and query performance
- Set appropriate timeouts for long-running operations

### Memory and Performance
- Monitor memory usage during large data migrations
- Use batched operations for large data sets
- Schedule migrations during low-traffic periods

### Monitoring During Migration
```sql
-- Query to monitor migration progress
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_tup_ins + n_tup_upd DESC;
```

This comprehensive migration strategy ensures a smooth transition to the multi-provider portfolio aggregation system while preserving all existing data and maintaining system reliability.
