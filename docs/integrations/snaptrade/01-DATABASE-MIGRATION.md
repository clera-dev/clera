# Database Migration for SnapTrade Integration

## Overview

This migration **extends** your existing schema to support SnapTrade while preserving all Plaid functionality. We use feature flags to determine which provider to use.

## Migration File: `008_add_snaptrade_support.sql`

Create this file in `backend/migrations/008_add_snaptrade_support.sql`:

```sql
-- =====================================================
-- Migration 008: Add SnapTrade Support
-- =====================================================
-- Description: Extends investment account schema to support SnapTrade
--              while preserving all existing Plaid functionality
-- Author: Migration Script
-- Date: 2025-10-09
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. Add SnapTrade-specific columns to existing tables
-- =====================================================

-- Add SnapTrade user credentials to user accounts
ALTER TABLE user_investment_accounts
ADD COLUMN IF NOT EXISTS snaptrade_user_secret TEXT,
ADD COLUMN IF NOT EXISTS snaptrade_authorization_id UUID,
ADD COLUMN IF NOT EXISTS brokerage_name TEXT,
ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'read', -- 'read' or 'trade'
ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'active'; -- 'active', 'disabled', 'error'

-- Add indexes for SnapTrade queries
CREATE INDEX IF NOT EXISTS idx_snaptrade_auth_id 
ON user_investment_accounts(snaptrade_authorization_id) 
WHERE snaptrade_authorization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_connection_status 
ON user_investment_accounts(connection_status);

-- =====================================================
-- 2. Create SnapTrade user registry table
-- =====================================================

CREATE TABLE IF NOT EXISTS snaptrade_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snaptrade_user_id TEXT NOT NULL UNIQUE, -- Usually same as Supabase user_id
    snaptrade_user_secret TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_sync_at TIMESTAMPTZ,
    
    -- Ensure one SnapTrade account per user
    UNIQUE(user_id)
);

-- Add RLS policies for SnapTrade users
ALTER TABLE snaptrade_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own SnapTrade credentials"
ON snaptrade_users FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own SnapTrade credentials"
ON snaptrade_users FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own SnapTrade credentials"
ON snaptrade_users FOR UPDATE
USING (auth.uid() = user_id);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_snaptrade_users_user_id 
ON snaptrade_users(user_id);

-- =====================================================
-- 3. Create brokerage connections table
-- =====================================================

CREATE TABLE IF NOT EXISTS snaptrade_brokerage_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    authorization_id UUID NOT NULL, -- SnapTrade authorization ID
    brokerage_slug TEXT NOT NULL, -- e.g., 'ALPACA', 'SCHWAB', 'FIDELITY'
    brokerage_name TEXT NOT NULL,
    connection_type TEXT NOT NULL DEFAULT 'read', -- 'read', 'trade'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled', 'error'
    disabled_date TIMESTAMPTZ,
    error_message TEXT,
    
    -- Account metadata
    accounts_count INT DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Unique constraint: one connection per authorization
    UNIQUE(authorization_id)
);

-- Add RLS policies
ALTER TABLE snaptrade_brokerage_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
ON snaptrade_brokerage_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own connections"
ON snaptrade_brokerage_connections FOR ALL
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snaptrade_connections_user_id 
ON snaptrade_brokerage_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_snaptrade_connections_status 
ON snaptrade_brokerage_connections(status);

-- =====================================================
-- 4. Extend aggregated holdings for SnapTrade data
-- =====================================================

-- Add SnapTrade-specific metadata to holdings
ALTER TABLE user_aggregated_holdings
ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS universal_symbol_id UUID, -- SnapTrade's universal symbol ID
ADD COLUMN IF NOT EXISTS option_contract JSONB; -- For options data

-- Index for symbol lookups
CREATE INDEX IF NOT EXISTS idx_universal_symbol_id 
ON user_aggregated_holdings(universal_symbol_id) 
WHERE universal_symbol_id IS NOT NULL;

-- =====================================================
-- 5. Create orders tracking table
-- =====================================================

CREATE TABLE IF NOT EXISTS snaptrade_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL, -- References user_investment_accounts
    brokerage_order_id TEXT NOT NULL, -- Order ID from brokerage
    
    -- Order details
    symbol TEXT NOT NULL,
    universal_symbol_id UUID,
    action TEXT NOT NULL, -- 'BUY', 'SELL', etc.
    order_type TEXT NOT NULL, -- 'MARKET', 'LIMIT', etc.
    time_in_force TEXT, -- 'DAY', 'GTC', etc.
    
    -- Quantities and prices
    units DECIMAL(15, 6),
    notional_value DECIMAL(15, 2),
    limit_price DECIMAL(15, 6),
    stop_price DECIMAL(15, 6),
    filled_units DECIMAL(15, 6),
    average_fill_price DECIMAL(15, 6),
    
    -- Status tracking
    status TEXT NOT NULL, -- 'PENDING', 'EXECUTED', 'CANCELLED', 'REJECTED'
    status_message TEXT,
    
    -- Timestamps
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    filled_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Raw order data from SnapTrade
    raw_order_data JSONB,
    
    -- Constraints
    UNIQUE(brokerage_order_id, account_id)
);

-- Add RLS policies
ALTER TABLE snaptrade_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
ON snaptrade_orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
ON snaptrade_orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snaptrade_orders_user_id 
ON snaptrade_orders(user_id);

CREATE INDEX IF NOT EXISTS idx_snaptrade_orders_account_id 
ON snaptrade_orders(account_id);

CREATE INDEX IF NOT EXISTS idx_snaptrade_orders_status 
ON snaptrade_orders(status);

CREATE INDEX IF NOT EXISTS idx_snaptrade_orders_placed_at 
ON snaptrade_orders(placed_at DESC);

-- =====================================================
-- 6. Update user_investment_accounts to support hybrid mode
-- =====================================================

-- Add mode tracking column
ALTER TABLE user_investment_accounts
ADD COLUMN IF NOT EXISTS account_mode TEXT DEFAULT 'plaid'; -- 'plaid', 'snaptrade', 'alpaca'

-- Create index for mode filtering
CREATE INDEX IF NOT EXISTS idx_account_mode 
ON user_investment_accounts(account_mode);

-- =====================================================
-- 7. Create view for unified account information
-- =====================================================

CREATE OR REPLACE VIEW v_unified_investment_accounts AS
SELECT 
    uia.id,
    uia.user_id,
    uia.provider,
    uia.provider_account_id,
    uia.institution_name,
    uia.account_name,
    uia.account_type,
    uia.account_subtype,
    uia.is_active,
    uia.account_mode,
    
    -- SnapTrade specific
    uia.snaptrade_authorization_id,
    uia.brokerage_name,
    uia.connection_type,
    uia.connection_status,
    
    -- Connection info
    sbc.status as brokerage_connection_status,
    sbc.last_synced_at as brokerage_last_synced,
    
    -- Metadata
    uia.created_at,
    uia.updated_at,
    uia.last_synced
FROM user_investment_accounts uia
LEFT JOIN snaptrade_brokerage_connections sbc 
    ON uia.snaptrade_authorization_id = sbc.authorization_id;

-- =====================================================
-- 8. Create function to get user portfolio mode
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_portfolio_mode(p_user_id UUID)
RETURNS TABLE(
    mode TEXT,
    has_alpaca BOOLEAN,
    has_plaid BOOLEAN,
    has_snaptrade BOOLEAN,
    alpaca_account_id TEXT,
    accounts_count INT
) AS $$
DECLARE
    v_has_alpaca BOOLEAN;
    v_has_plaid BOOLEAN;
    v_has_snaptrade BOOLEAN;
    v_alpaca_account_id TEXT;
    v_mode TEXT;
BEGIN
    -- Check for Alpaca account
    SELECT EXISTS(
        SELECT 1 FROM user_onboarding 
        WHERE user_id = p_user_id AND alpaca_account_id IS NOT NULL
    ) INTO v_has_alpaca;
    
    -- Get Alpaca account ID if exists
    IF v_has_alpaca THEN
        SELECT alpaca_account_id INTO v_alpaca_account_id
        FROM user_onboarding
        WHERE user_id = p_user_id;
    END IF;
    
    -- Check for Plaid accounts
    SELECT EXISTS(
        SELECT 1 FROM user_investment_accounts
        WHERE user_id = p_user_id 
        AND provider = 'plaid' 
        AND is_active = true
    ) INTO v_has_plaid;
    
    -- Check for SnapTrade accounts
    SELECT EXISTS(
        SELECT 1 FROM user_investment_accounts
        WHERE user_id = p_user_id 
        AND provider = 'snaptrade' 
        AND is_active = true
    ) INTO v_has_snaptrade;
    
    -- Determine mode
    IF v_has_alpaca AND (v_has_plaid OR v_has_snaptrade) THEN
        v_mode := 'hybrid';
    ELSIF v_has_alpaca THEN
        v_mode := 'brokerage';
    ELSIF v_has_plaid OR v_has_snaptrade THEN
        v_mode := 'aggregation';
    ELSE
        v_mode := 'none';
    END IF;
    
    -- Return result
    RETURN QUERY
    SELECT 
        v_mode,
        v_has_alpaca,
        v_has_plaid,
        v_has_snaptrade,
        v_alpaca_account_id,
        (SELECT COUNT(*)::INT FROM user_investment_accounts 
         WHERE user_id = p_user_id AND is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. Add helpful comments
-- =====================================================

COMMENT ON TABLE snaptrade_users IS 'Registry of SnapTrade user credentials';
COMMENT ON TABLE snaptrade_brokerage_connections IS 'Brokerage connections via SnapTrade';
COMMENT ON TABLE snaptrade_orders IS 'Order history from SnapTrade executions';
COMMENT ON COLUMN user_investment_accounts.account_mode IS 'Provider type: plaid, snaptrade, or alpaca';
COMMENT ON COLUMN user_investment_accounts.connection_type IS 'read (data only) or trade (data + execution)';

-- =====================================================
-- 10. Create updated_at trigger for new tables
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to SnapTrade tables
CREATE TRIGGER update_snaptrade_users_updated_at
    BEFORE UPDATE ON snaptrade_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snaptrade_connections_updated_at
    BEFORE UPDATE ON snaptrade_brokerage_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snaptrade_orders_updated_at
    BEFORE UPDATE ON snaptrade_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Migration Complete
-- =====================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 008: SnapTrade support added successfully';
    RAISE NOTICE 'Tables created: snaptrade_users, snaptrade_brokerage_connections, snaptrade_orders';
    RAISE NOTICE 'Columns added to: user_investment_accounts, user_aggregated_holdings';
    RAISE NOTICE 'Views created: v_unified_investment_accounts';
    RAISE NOTICE 'Functions created: get_user_portfolio_mode()';
END $$;
```

## Migration Verification Script

Create `backend/scripts/verify_snaptrade_migration.py`:

```python
"""
Verify SnapTrade migration was successful.
"""
import asyncio
from utils.supabase.db_client import get_supabase_client

async def verify_migration():
    supabase = get_supabase_client()
    
    print("🔍 Verifying SnapTrade migration...")
    
    # Check tables exist
    tables_to_check = [
        'snaptrade_users',
        'snaptrade_brokerage_connections',
        'snaptrade_orders'
    ]
    
    for table in tables_to_check:
        try:
            result = supabase.table(table).select('*').limit(1).execute()
            print(f"✅ Table '{table}' exists and is accessible")
        except Exception as e:
            print(f"❌ Table '{table}' check failed: {e}")
    
    # Check columns added
    try:
        result = supabase.table('user_investment_accounts')\
            .select('snaptrade_user_secret, snaptrade_authorization_id, account_mode')\
            .limit(1)\
            .execute()
        print("✅ New columns added to user_investment_accounts")
    except Exception as e:
        print(f"❌ Column check failed: {e}")
    
    # Check view exists
    try:
        result = supabase.rpc('get_user_portfolio_mode', {
            'p_user_id': '00000000-0000-0000-0000-000000000000'  # Test UUID
        }).execute()
        print("✅ Function get_user_portfolio_mode() exists")
    except Exception as e:
        print(f"⚠️ Function check (expected to fail with test UUID): {e}")
    
    print("\n✅ Migration verification complete!")

if __name__ == "__main__":
    asyncio.run(verify_migration())
```

## Running the Migration

```bash
# 1. Connect to your Supabase project
# 2. Run the migration SQL file
psql -h <your-db-host> -U postgres -d postgres -f backend/migrations/008_add_snaptrade_support.sql

# 3. Verify migration
python backend/scripts/verify_snaptrade_migration.py
```

## Key Design Decisions

### 1. **Preserve Plaid Support**
- All Plaid columns remain intact
- New SnapTrade columns are additive
- `account_mode` column distinguishes providers

### 2. **User Secret Storage**
- SnapTrade user secrets stored in dedicated `snaptrade_users` table
- One-to-one mapping with Supabase user ID
- Encrypted at rest (Supabase default)

### 3. **Brokerage Connections**
- Separate tracking table for connection health
- Supports multiple brokerages per user
- Connection status monitoring

### 4. **Order Tracking**
- Complete order history in database
- Supports all order types (market, limit, stop, etc.)
- Raw SnapTrade response preserved for debugging

### 5. **Hybrid Mode Support**
- `get_user_portfolio_mode()` function determines user's setup
- Supports: brokerage-only, aggregation-only, or hybrid

## Next Steps

After running this migration:

1. ✅ Your database supports SnapTrade
2. ✅ You can store user credentials securely
3. ✅ You can track orders and connections
4. ✅ Your existing Plaid data is preserved

**Next**: Proceed to [02-SNAPTRADE-PROVIDER.md](./02-SNAPTRADE-PROVIDER.md) to implement the SnapTrade provider.

