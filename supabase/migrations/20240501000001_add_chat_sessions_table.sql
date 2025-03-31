-- Create chat_sessions table
create table if not exists public.chat_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  portfolio_id text not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add table comment
comment on table public.chat_sessions is 'Stores chat sessions for user conversations with Clera AI';

-- Set up RLS policies
alter table chat_sessions enable row level security;

-- View policy
create policy "Users can view own chat sessions"
  on chat_sessions for select
  using ( auth.uid() = user_id );

-- Insert policy
create policy "Users can insert own chat sessions"
  on chat_sessions for insert
  with check ( auth.uid() = user_id );

-- Delete policy
create policy "Users can delete own chat sessions"
  on chat_sessions for delete
  using ( auth.uid() = user_id );

-- Grant access to authenticated users
grant select, insert, delete on public.chat_sessions to authenticated;

-- Modify conversations table to include session_id
alter table public.conversations 
add column session_id uuid references public.chat_sessions(id) on delete cascade;

-- Create index for faster querying
create index if not exists conversations_session_id_idx
  on public.conversations(session_id); 