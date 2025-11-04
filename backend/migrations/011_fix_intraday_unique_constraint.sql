-- Migration 011: Fix Intraday Snapshot Unique Constraint
-- Purpose: Allow multiple intraday snapshots per day for professional-grade 1D charts
-- Date: 2025-10-28
--
-- CRITICAL: The existing UNIQUE(user_id, value_date, snapshot_type) constraint
-- prevents storing multiple intraday snapshots on the same day. This is needed
-- for accurate 1D charts showing portfolio fluctuations every 5 minutes.
--
-- Solution: Drop the existing constraint and create a partial unique constraint
-- that applies only to daily_eod and reconstructed snapshots, while allowing
-- multiple intraday snapshots per day.

-- ===============================================
-- DROP OLD CONSTRAINT (applies to parent and all partitions)
-- ===============================================

-- Drop from parent table (will cascade to partitions)
ALTER TABLE public.user_portfolio_history 
DROP CONSTRAINT IF EXISTS user_portfolio_history_user_id_value_date_snapshot_typ_key;

-- ===============================================
-- CREATE NEW PARTIAL UNIQUE INDEXES (PostgreSQL syntax)
-- ===============================================

-- For parent table: Ensure only ONE daily_eod snapshot per user per day
-- Using partial unique index instead of constraint (PostgreSQL best practice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_portfolio_history_unique_daily_eod
ON public.user_portfolio_history (user_id, value_date)
WHERE snapshot_type = 'daily_eod';

-- For parent table: Ensure only ONE reconstructed snapshot per user per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_portfolio_history_unique_reconstructed
ON public.user_portfolio_history (user_id, value_date)
WHERE snapshot_type = 'reconstructed';

-- Note: NO constraint/index for intraday snapshots - allow unlimited per day
-- This enables professional-grade tracking with ~75-80 snapshots per day

-- ===============================================
-- VERIFY MIGRATION
-- ===============================================

DO $$
BEGIN
    -- Verify old constraint is gone
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'user_portfolio_history_user_id_value_date_snapshot_typ_key'
    ) THEN
        RAISE EXCEPTION 'Migration failed: Old constraint still exists';
    END IF;
    
    -- Verify new partial unique indexes exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE indexname = 'idx_user_portfolio_history_unique_daily_eod'
    ) THEN
        RAISE EXCEPTION 'Migration failed: New daily_eod unique index not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE indexname = 'idx_user_portfolio_history_unique_reconstructed'
    ) THEN
        RAISE EXCEPTION 'Migration failed: New reconstructed unique index not created';
    END IF;
    
    RAISE NOTICE 'Migration 011 completed successfully:';
    RAISE NOTICE '✅ Dropped old unique constraint';
    RAISE NOTICE '✅ Created partial unique index for daily_eod snapshots';
    RAISE NOTICE '✅ Created partial unique index for reconstructed snapshots';
    RAISE NOTICE '✅ Intraday snapshots can now be stored every 5 minutes';
END $$;

-- ===============================================
-- ADDITIONAL NOTES
-- ===============================================

-- This migration enables professional-grade intraday tracking:
-- - ~75-80 snapshots per day during market hours (9:30 AM - 4:00 PM EST)
-- - Accurate 1D charts showing real portfolio fluctuations, not interpolation
-- - Storage cost: ~365 * 80 = 29,200 intraday snapshots/user/year
-- - With cleanup (keep 7 days): ~560 intraday snapshots/user maximum
-- - Acceptable for a platform replacing all brokerages

COMMENT ON TABLE public.user_portfolio_history IS 
'Portfolio history with intraday tracking. Unique constraints enforce one daily_eod and one reconstructed snapshot per day, but allow unlimited intraday snapshots for professional-grade 1D charts.';

