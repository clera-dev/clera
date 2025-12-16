-- Migration 007: Create user watchlist table for aggregation mode
-- This allows users without Alpaca accounts to have watchlists

-- Create user_watchlist table
CREATE TABLE IF NOT EXISTS public.user_watchlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON public.user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_symbol ON public.user_watchlist(symbol);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_added_at ON public.user_watchlist(added_at DESC);

-- Add comments
COMMENT ON TABLE public.user_watchlist IS 'Stores watchlist symbols for users (works for both aggregation and brokerage modes)';
COMMENT ON COLUMN public.user_watchlist.user_id IS 'Reference to auth.users.id';
COMMENT ON COLUMN public.user_watchlist.symbol IS 'Stock symbol (e.g., AAPL, TSLA)';
COMMENT ON COLUMN public.user_watchlist.added_at IS 'Timestamp when symbol was added to watchlist';

-- Enable RLS
ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access their own watchlist
CREATE POLICY "Users can view their own watchlist"
    ON public.user_watchlist
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert to their own watchlist"
    ON public.user_watchlist
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete from their own watchlist"
    ON public.user_watchlist
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.user_watchlist TO authenticated;

