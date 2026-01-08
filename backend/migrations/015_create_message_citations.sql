-- Migration: Create message_citations table for persisting web search citations
-- This table stores citations tied to specific run_ids to ensure per-message isolation

-- Create the message_citations table
CREATE TABLE IF NOT EXISTS message_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL,
    thread_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of citation URLs
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each run should only have one citations entry
    CONSTRAINT unique_run_citations UNIQUE (run_id)
);

-- Create index for fast lookups by thread_id (for loading historical citations)
CREATE INDEX IF NOT EXISTS idx_message_citations_thread_id ON message_citations(thread_id);

-- Create index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_message_citations_user_id ON message_citations(user_id);

-- Create index for lookups by run_id
CREATE INDEX IF NOT EXISTS idx_message_citations_run_id ON message_citations(run_id);

-- Enable Row Level Security
ALTER TABLE message_citations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own citations
CREATE POLICY "Users can read their own citations" ON message_citations
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert/update (for server-side writes)
-- Note: Server uses service role key which bypasses RLS, but we define policies for safety
CREATE POLICY "Service role can insert citations" ON message_citations
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role can update citations" ON message_citations
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE message_citations IS 'Stores web search citations per chat run for proper historical loading and per-message isolation';
COMMENT ON COLUMN message_citations.run_id IS 'The run_id from chat_runs that this citation set belongs to';
COMMENT ON COLUMN message_citations.thread_id IS 'The LangGraph thread_id for faster thread-based lookups';
COMMENT ON COLUMN message_citations.citations IS 'JSON array of citation URLs from web search';
