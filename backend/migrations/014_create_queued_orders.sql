-- Migration 014: Create queued orders table for market-closed order queueing
-- This table stores orders that users submit when the market is closed.
-- A background job will attempt to execute these when the market opens.

-- Create queued_orders table
CREATE TABLE IF NOT EXISTS queued_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Account information
    account_id TEXT NOT NULL,  -- SnapTrade account UUID
    provider TEXT NOT NULL DEFAULT 'snaptrade',  -- 'snaptrade' or 'alpaca'
    
    -- Order details
    symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
    order_type TEXT NOT NULL DEFAULT 'Market',
    time_in_force TEXT NOT NULL DEFAULT 'Day',
    
    -- Amount (one of these should be set)
    notional_value DECIMAL(15, 2),  -- Dollar amount for market orders
    units DECIMAL(15, 6),  -- Number of shares for limit orders
    price DECIMAL(15, 4),  -- Limit price
    stop_price DECIMAL(15, 4),  -- Stop price
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled')),
    error_message TEXT,
    
    -- Execution details (filled after execution)
    brokerage_order_id TEXT,
    executed_at TIMESTAMPTZ,
    execution_price DECIMAL(15, 4),
    filled_quantity DECIMAL(15, 6),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_amount CHECK (
        notional_value IS NOT NULL OR units IS NOT NULL
    )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_queued_orders_user_id ON queued_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_queued_orders_status ON queued_orders(status);
CREATE INDEX IF NOT EXISTS idx_queued_orders_pending ON queued_orders(status, created_at) WHERE status = 'pending';

-- Add RLS policies
ALTER TABLE queued_orders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own queued orders
CREATE POLICY "Users can view their own queued orders"
    ON queued_orders FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own queued orders
CREATE POLICY "Users can create their own queued orders"
    ON queued_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can cancel their own pending orders
CREATE POLICY "Users can update their own queued orders"
    ON queued_orders FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can do everything (for background job execution)
CREATE POLICY "Service role has full access to queued orders"
    ON queued_orders FOR ALL
    USING (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_queued_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queued_orders_updated_at
    BEFORE UPDATE ON queued_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_queued_orders_updated_at();

-- Add comment
COMMENT ON TABLE queued_orders IS 'Stores orders queued when market is closed. Background job executes these when market opens.';

