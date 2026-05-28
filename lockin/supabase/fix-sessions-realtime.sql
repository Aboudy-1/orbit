-- Run in Supabase SQL Editor — fixes session visibility and realtime for other users.
--
-- This migration:
-- 1. Ensures focus_sessions is in the realtime publication
-- 2. Re-asserts the SELECT policy so any authenticated user can view sessions

-- Step 1: Add focus_sessions (and related tables) to the realtime publication
-- (These are idempotent — safe to run again)
alter publication supabase_realtime add table public.focus_sessions;
alter publication supabase_realtime add table public.session_participants;
alter publication supabase_realtime add table public.session_messages;
alter publication supabase_realtime add table public.profiles;

-- Step 2: Verify / re-create the SELECT policy for focus_sessions
-- (The schema already has this, but we re-assert it in case it was dropped)
drop policy if exists "Authenticated users can view sessions" on public.focus_sessions;

create policy "Authenticated users can view sessions"
  on public.focus_sessions for select to authenticated using (true);

-- Step 3: Re-assert host_id insert check policy
drop policy if exists "Users can create sessions" on public.focus_sessions;

create policy "Users can create sessions"
  on public.focus_sessions for insert to authenticated
  with check (auth.uid() = host_id);