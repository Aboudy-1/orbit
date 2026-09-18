-- Run in Supabase SQL Editor — lets every participant control the session when
-- the host turns on "Allow all participants to control the session".
-- Without this migration the flag is persisted but non-hosts still get
-- "Only the host ..." errors from the timer RPCs.
--
-- PREREQUISITES (run first if you have never run them):
--   1. supabase/schema.sql
--   2. supabase/fix-timer-sync.sql        (adds focus_sessions.phase_ends_at)
--   3. supabase/add-pause-support.sql     (adds focus_sessions.is_paused, paused_at)
-- The ALTERs below re-ensure those columns exist, so this file is safe to
-- re-run on its own. THEN run supabase/delete-session-chat.sql afterwards,
-- because that file references can_control_session().

-- 0) Columns this file's RPCs touch (idempotent if the earlier migrations ran)
alter table public.focus_sessions
  add column if not exists phase_ends_at timestamptz;

alter table public.focus_sessions
  add column if not exists is_paused boolean not null default false;

alter table public.focus_sessions
  add column if not exists paused_at timestamptz;

alter table public.focus_sessions
  add column if not exists allow_all_control boolean not null default false;

-- 1) True when the caller may drive the session: the host, or any participant
-- while the host has allowed it.
-- Exact signature: public.can_control_session(uuid) -> boolean
create or replace function public.can_control_session(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $func$
  select exists (
    select 1
    from public.focus_sessions fs
    where fs.id = p_session_id
      and (
        fs.host_id = auth.uid()
        or (
          fs.allow_all_control = true
          and exists (
            select 1
            from public.session_participants sp
            where sp.session_id = fs.id
              and sp.user_id = auth.uid()
          )
        )
      )
  );
$func$;

grant execute on function public.can_control_session(uuid) to authenticated;

-- 2) Timer RPCs, all gated on can_control_session() instead of host-only.
-- NOTE: DROP + CREATE (not CREATE OR REPLACE) for the RPCs below.
-- Your DB already has end_focus_session(uuid) with a different return type
-- (e.g. void from an earlier console tweak), and Postgres error 42P13
-- forbids changing a return type via CREATE OR REPLACE — hence the drops.
-- The drops cover all six timer RPCs (+ the helper) so you won't hit the same
-- 42P13 error one function at a time; they are all IF EXISTS / signature
-- specific, so re-running this file is safe. The new definitions intentionally
-- keep the original `returns public.focus_sessions` type — the app reads the
-- returned row (see pauseSession/resumeSession in src/lib/api.ts).
drop function if exists public.can_control_session(uuid);
drop function if exists public.start_focus_session(uuid);
drop function if exists public.advance_focus_session(uuid, public.session_phase);
drop function if exists public.sync_focus_session_phase(uuid);
drop function if exists public.end_focus_session(uuid);
drop function if exists public.pause_focus_session(uuid);
drop function if exists public.resume_focus_session(uuid);

create or replace function public.start_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  result public.focus_sessions;
begin
  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can start the timer';
  end if;

  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id and is_active = true
  ) then
    raise exception 'Session is not active';
  end if;

  update public.focus_sessions fs
  set
    phase = 'focus',
    phase_started_at = now(),
    phase_ends_at = now() + (fs.focus_duration_sec * interval '1 second'),
    is_paused = false,
    paused_at = null
  where fs.id = p_session_id
  returning * into result;

  return result;
end;
$func$;

create or replace function public.advance_focus_session(
  p_session_id uuid,
  p_phase public.session_phase
)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  result public.focus_sessions;
  dur_sec int;
begin
  if p_phase not in ('focus', 'break') then
    raise exception 'Invalid phase';
  end if;

  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can advance the session';
  end if;

  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id and is_active = true
  ) then
    raise exception 'Session is not active';
  end if;

  select case when p_phase = 'focus' then focus_duration_sec else break_duration_sec end
  into dur_sec
  from public.focus_sessions
  where id = p_session_id;

  update public.focus_sessions
  set
    phase = p_phase,
    phase_started_at = now(),
    phase_ends_at = now() + (dur_sec * interval '1 second'),
    is_paused = false,
    paused_at = null
  where id = p_session_id
  returning * into result;

  return result;
end;
$func$;

create or replace function public.sync_focus_session_phase(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  s public.focus_sessions;
  next_phase public.session_phase;
  dur_sec int;
begin
  select * into s
  from public.focus_sessions
  where id = p_session_id and is_active = true;

  if not found then
    raise exception 'Session not found';
  end if;

  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can sync an active session';
  end if;

  if s.phase = 'idle' or s.phase_ends_at is null or now() < s.phase_ends_at then
    return s;
  end if;

  if s.phase = 'focus' then
    next_phase := 'break';
    dur_sec := s.break_duration_sec;
  else
    next_phase := 'focus';
    dur_sec := s.focus_duration_sec;
  end if;

  update public.focus_sessions
  set
    phase = next_phase,
    phase_started_at = now(),
    phase_ends_at = now() + (dur_sec * interval '1 second')
  where id = p_session_id
  returning * into s;

  return s;
end;
$func$;

create or replace function public.end_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  result public.focus_sessions;
begin
  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can end the session';
  end if;

  update public.focus_sessions
  set
    phase = 'idle',
    is_active = false,
    phase_started_at = null,
    phase_ends_at = null,
    is_paused = false,
    paused_at = null
  where id = p_session_id
  returning * into result;

  return result;
end;
$func$;

-- Pause/resume used to be direct table updates, which only the host could run
-- because of the "Host can update session" RLS policy. These RPCs make them
-- available to allowed participants as well.
create or replace function public.pause_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  result public.focus_sessions;
begin
  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can pause the session';
  end if;

  update public.focus_sessions
  set is_paused = true, paused_at = now()
  where id = p_session_id and phase <> 'idle' and is_paused = false
  returning * into result;

  if result.id is null then
    select * into result from public.focus_sessions where id = p_session_id;
  end if;

  return result;
end;
$func$;

create or replace function public.resume_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $func$
declare
  s public.focus_sessions;
  pause_ms bigint;
begin
  select * into s from public.focus_sessions where id = p_session_id;

  if not found then
    raise exception 'Session not found';
  end if;

  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can resume the session';
  end if;

  if s.is_paused and s.paused_at is not null then
    pause_ms := (extract(epoch from (now() - s.paused_at)) * 1000)::bigint;

    if s.phase_ends_at is not null then
      update public.focus_sessions
      set is_paused = false,
          paused_at = null,
          phase_ends_at = s.phase_ends_at + (pause_ms * interval '1 millisecond')
      where id = p_session_id
      returning * into s;
    else
      update public.focus_sessions
      set is_paused = false, paused_at = null
      where id = p_session_id
      returning * into s;
    end if;
  end if;

  return s;
end;
$func$;

grant execute on function public.start_focus_session(uuid) to authenticated;
grant execute on function public.advance_focus_session(uuid, public.session_phase) to authenticated;
grant execute on function public.sync_focus_session_phase(uuid) to authenticated;
grant execute on function public.end_focus_session(uuid) to authenticated;
grant execute on function public.pause_focus_session(uuid) to authenticated;
grant execute on function public.resume_focus_session(uuid) to authenticated;
