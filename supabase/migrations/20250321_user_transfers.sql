-- Create the user_transfers table to store information about bank transfers
CREATE TABLE IF NOT EXISTS public.user_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alpaca_account_id TEXT NOT NULL,
    relationship_id TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    transfer_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- Add RLS policies
ALTER TABLE public.user_transfers ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own transfers
CREATE POLICY "Users can view their own transfers"
    ON public.user_transfers
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy to allow users to insert their own transfers
CREATE POLICY "Users can create their own transfers"
    ON public.user_transfers
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_updated_at
BEFORE UPDATE ON public.user_transfers
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at(); 