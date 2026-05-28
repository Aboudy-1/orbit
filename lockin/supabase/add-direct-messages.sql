-- Run in Supabase SQL Editor — adds direct messaging between friends.
-- Drop and recreate with explicit foreign key names to ensure Supabase schema cache picks them up.

drop table if exists public.direct_messages;

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  receiver_id uuid not null,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_sender_profile_fk foreign key (sender_id) references public.profiles (id) on delete cascade,
  constraint direct_messages_receiver_profile_fk foreign key (receiver_id) references public.profiles (id) on delete cascade
);

create index direct_messages_participants_idx on public.direct_messages (sender_id, receiver_id, created_at);

alter table public.direct_messages enable row level security;

create policy "Users can send direct messages"
  on public.direct_messages for insert to authenticated
  with check (auth.uid() = sender_id);

create policy "Users can read their own direct messages"
  on public.direct_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Allow receiver to mark messages as read
create policy "Users can mark messages as read"
  on public.direct_messages for update to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);