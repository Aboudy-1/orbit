-- Run in Supabase SQL Editor — per-user (non-destructive) chat hiding.
--
-- Nothing is ever deleted: each user stores a watermark and messages at or
-- before that watermark are simply filtered out of *their own* view.
--   * friend DMs  -> direct_message_hides.hidden_at per (user, other user)
--   * session chat -> session_participants.cleared_at per (session, user)
-- The other participants keep their full history.

-- 1) Friend DMs: "I deleted this conversation" for one user only
create table if not exists public.direct_message_hides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  other_user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, other_user_id)
);

create index if not exists direct_message_hides_user_idx
  on public.direct_message_hides (user_id);

alter table public.direct_message_hides enable row level security;

drop policy if exists "Users manage their own hidden conversations" on public.direct_message_hides;
create policy "Users manage their own hidden conversations"
  on public.direct_message_hides for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) Session chat: "clear chat for me" stores a watermark on my own row
alter table public.session_participants
  add column if not exists cleared_at timestamptz;

-- Participants previously had no update policy, so they could not write their
-- own cleared_at watermark. Scope it to their own row.
drop policy if exists "Participants can update their own membership" on public.session_participants;
create policy "Participants can update their own membership"
  on public.session_participants for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
