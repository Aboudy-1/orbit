-- Run in Supabase SQL Editor — fixes timers resetting wrong on page refresh.

alter table public.focus_sessions
  add column if not exists phase_ends_at timestamptz;

-- Backfill end time for sessions already in progress
update public.focus_sessions fs
set phase_ends_at = fs.phase_started_at + (
  case fs.phase
    when 'focus' then fs.focus_duration_sec
    when 'break' then fs.break_duration_sec
    else 0
  end * interval '1 second'
)
where fs.phase in ('focus', 'break')
  and fs.phase_started_at is not null
  and fs.phase_ends_at is null;

create or replace function public.start_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.focus_sessions;
begin
  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id and host_id = auth.uid() and is_active = true
  ) then
    raise exception 'Only the active session host can start the timer';
  end if;

  update public.focus_sessions fs
  set
    phase = 'focus',
    phase_started_at = now(),
    phase_ends_at = now() + (fs.focus_duration_sec * interval '1 second')
  where fs.id = p_session_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.advance_focus_session(
  p_session_id uuid,
  p_phase public.session_phase
)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.focus_sessions;
  dur_sec int;
begin
  if p_phase not in ('focus', 'break') then
    raise exception 'Invalid phase';
  end if;

  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id and host_id = auth.uid() and is_active = true
  ) then
    raise exception 'Only the host can advance the session';
  end if;

  select case when p_phase = 'focus' then focus_duration_sec else break_duration_sec end
  into dur_sec
  from public.focus_sessions
  where id = p_session_id;

  update public.focus_sessions
  set
    phase = p_phase,
    phase_started_at = now(),
    phase_ends_at = now() + (dur_sec * interval '1 second')
  where id = p_session_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.sync_focus_session_phase(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.focus_sessions;
  next_phase public.session_phase;
  dur_sec int;
begin
  select * into s
  from public.focus_sessions
  where id = p_session_id and host_id = auth.uid() and is_active = true;

  if not found then
    raise exception 'Only the host can sync an active session';
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
$$;

create or replace function public.end_focus_session(p_session_id uuid)
returns public.focus_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.focus_sessions;
begin
  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id and host_id = auth.uid()
  ) then
    raise exception 'Only the host can end the session';
  end if;

  update public.focus_sessions
  set
    phase = 'idle',
    is_active = false,
    phase_started_at = null,
    phase_ends_at = null
  where id = p_session_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.sync_focus_session_phase(uuid) to authenticated;
