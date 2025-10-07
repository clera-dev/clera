# Database Migration Instructions for Portfolio Aggregation Pivot

## Overview
These SQL scripts create the database tables needed for multi-provider portfolio aggregation. Run these commands in your Supabase SQL Editor in the exact order specified.

## Prerequisites
- Supabase project with existing `auth.users` table
- Admin access to Supabase SQL Editor
- Backup of existing database (recommended)

## Migration Order (CRITICAL - Run in this exact order)

### 1. First, run Migration 001
**File**: `001_create_investment_accounts.sql`
**Purpose**: Creates main table for storing investment account connections

```sql
-- Copy and paste the ENTIRE contents of 001_create_investment_accounts.sql
-- into Supabase SQL Editor and execute
```

### 2. Then, run Migration 002  
**File**: `002_create_aggregated_holdings.sql`
**Purpose**: Creates cache table for aggregated position data

```sql
-- Copy and paste the ENTIRE contents of 002_create_aggregated_holdings.sql
-- into Supabase SQL Editor and execute
```

### 3. Finally, run Migration 003
**File**: `003_create_portfolio_snapshots.sql` 
**Purpose**: Creates table for historical portfolio tracking

```sql
-- Copy and paste the ENTIRE contents of 003_create_portfolio_snapshots.sql
-- into Supabase SQL Editor and execute
```

## Verification Commands

After running all migrations, execute this verification query in Supabase SQL Editor:

```sql
-- Verify all tables were created successfully
SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('user_investment_accounts', 'user_aggregated_holdings', 'user_portfolio_snapshots')
GROUP BY table_name
ORDER BY table_name;

-- Check RLS is enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('user_investment_accounts', 'user_aggregated_holdings', 'user_portfolio_snapshots');

-- Check indexes were created
SELECT 
    indexname,
    tablename
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('user_investment_accounts', 'user_aggregated_holdings', 'user_portfolio_snapshots')
ORDER BY tablename, indexname;
```

**Expected Results:**
- 3 tables with column counts: user_investment_accounts (~20), user_aggregated_holdings (~18), user_portfolio_snapshots (~16)
- All tables should show `rls_enabled = true`
- Multiple indexes should be listed for each table

## Rollback Commands (Emergency Use Only)

If you need to rollback these changes:

```sql
-- WARNING: This will permanently delete all data in these tables
-- Only run if you have backups and need to rollback

DROP TABLE IF EXISTS public.user_portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS public.user_aggregated_holdings CASCADE;  
DROP TABLE IF EXISTS public.user_investment_accounts CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS create_daily_portfolio_snapshot(UUID, DECIMAL, DECIMAL, INTEGER, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS refresh_user_aggregated_holdings(UUID) CASCADE;
```

## Next Steps After Migration

1. Verify all tables exist and have proper structure
2. Test that RLS policies work correctly
3. Run the backend service to test database connectivity
4. Proceed with Plaid API integration testing

## Notes

- All tables use Row-Level Security (RLS) to ensure users can only access their own data
- Financial amounts use DECIMAL type for precise currency calculations
- JSONB columns allow flexible storage of provider-specific data
- Indexes are optimized for common query patterns (user lookups, date ranges, value sorting)
- All migrations are additive (no data loss) and can be run on production without downtime
