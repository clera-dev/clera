-- Create conversations table
create table if not exists public.conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  portfolio_id text not null,
  message text not null,
  response text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add table comment
comment on table public.conversations is 'Stores chat conversations between users and Clera AI';

-- Set up RLS policies
alter table conversations enable row level security;

-- View policy
create policy "Users can view own conversations"
  on conversations for select
  using ( auth.uid() = user_id );

-- Insert policy
create policy "Users can insert own conversations"
  on conversations for insert
  with check ( auth.uid() = user_id );

-- Grant access to authenticated users
grant select, insert on public.conversations to authenticated; 