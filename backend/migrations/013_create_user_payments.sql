-- Migration 013: Create user_payments table for Stripe subscription tracking
-- Purpose: Track user payment status and Stripe subscription information
-- Author: Stripe Integration
-- Date: 2025-01-XX

-- Create the user_payments table
CREATE TABLE IF NOT EXISTS public.user_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Stripe information
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    
    -- Payment status
    payment_status TEXT NOT NULL DEFAULT 'inactive' 
        CHECK (payment_status IN ('active', 'inactive', 'past_due', 'canceled', 'unpaid')),
    subscription_status TEXT 
        CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    UNIQUE(user_id) -- One payment record per user
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_payments_user_id ON public.user_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_stripe_customer ON public.user_payments(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_stripe_subscription ON public.user_payments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_status ON public.user_payments(payment_status, subscription_status);

-- Enable Row Level Security
ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own payment records"
    ON public.user_payments
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment records"
    ON public.user_payments
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Note: Inserts are handled by webhooks using service role key (bypasses RLS)
-- Service role key is used in /api/stripe/webhook route to insert/update payment records
-- This allows Stripe webhooks to update payment status for any user

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_payments_timestamp
    BEFORE UPDATE ON public.user_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_user_payments_updated_at();

