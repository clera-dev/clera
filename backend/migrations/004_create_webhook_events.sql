-- Migration 004: Create plaid_webhook_events table
-- Purpose: Track webhook processing for monitoring and debugging
-- Author: Portfolio Aggregation Pivot
-- Date: 2025-01-13

-- Create webhook events tracking table
CREATE TABLE public.plaid_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Webhook identification
    webhook_type TEXT NOT NULL, -- 'HOLDINGS', 'INVESTMENTS_TRANSACTIONS', etc.
    webhook_code TEXT NOT NULL, -- 'DEFAULT_UPDATE', 'HISTORICAL_UPDATE', etc.
    item_id TEXT NOT NULL, -- Plaid item ID
    request_id TEXT, -- Plaid request ID for debugging
    
    -- User association
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Processing metrics
    processed_at TIMESTAMPTZ DEFAULT now(),
    processing_duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Webhook payload (for debugging)
    raw_webhook_data JSONB DEFAULT '{}',
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_webhook_events_item_id ON public.plaid_webhook_events(item_id, created_at DESC);
CREATE INDEX idx_webhook_events_user_id ON public.plaid_webhook_events(user_id, created_at DESC);
CREATE INDEX idx_webhook_events_type ON public.plaid_webhook_events(webhook_type, webhook_code, created_at DESC);
CREATE INDEX idx_webhook_events_success ON public.plaid_webhook_events(success, created_at DESC);
CREATE INDEX idx_webhook_events_processing_time ON public.plaid_webhook_events(processing_duration_ms DESC) 
    WHERE processing_duration_ms IS NOT NULL;

-- GIN index for webhook payload queries
CREATE INDEX idx_webhook_events_payload ON public.plaid_webhook_events USING GIN(raw_webhook_data);

-- Row Level Security
ALTER TABLE public.plaid_webhook_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own webhook events
CREATE POLICY "Users can view their webhook events" ON public.plaid_webhook_events
    FOR SELECT
    USING (auth.uid() = user_id);

-- Admin policy for monitoring (adjust based on your admin implementation)
CREATE POLICY "Admins can view all webhook events" ON public.plaid_webhook_events
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin'); -- Adjust based on your admin role setup

-- Add helpful comments
COMMENT ON TABLE public.plaid_webhook_events IS 'Tracking table for Plaid webhook processing and monitoring';
COMMENT ON COLUMN public.plaid_webhook_events.webhook_type IS 'Type of webhook: HOLDINGS, INVESTMENTS_TRANSACTIONS, etc.';
COMMENT ON COLUMN public.plaid_webhook_events.processing_duration_ms IS 'Time taken to process webhook in milliseconds';
COMMENT ON COLUMN public.plaid_webhook_events.raw_webhook_data IS 'Complete webhook payload for debugging purposes';

-- Create function to clean up old webhook events (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.plaid_webhook_events 
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup operation
    INSERT INTO public.plaid_webhook_events (
        webhook_type, 
        webhook_code, 
        item_id, 
        user_id, 
        success, 
        raw_webhook_data
    ) VALUES (
        'SYSTEM', 
        'CLEANUP', 
        'system', 
        NULL, 
        true, 
        jsonb_build_object('deleted_count', deleted_count, 'cleanup_date', CURRENT_DATE)
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run monthly (you can set this up with pg_cron or external scheduler)
-- SELECT cron.schedule('cleanup-webhook-events', '0 2 1 * *', 'SELECT cleanup_old_webhook_events();');

-- Verify table creation
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'plaid_webhook_events'
ORDER BY ordinal_position;
