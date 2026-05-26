-- Run in Supabase SQL Editor if "Start focus" does nothing or friends cannot sync timers.

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
    where id = p_session_id
      and host_id = auth.uid()
      and is_active = true
  ) then
    raise exception 'Only the active session host can start the timer';
  end if;

  update public.focus_sessions
  set phase = 'focus', phase_started_at = now()
  where id = p_session_id
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
begin
  if p_phase not in ('focus', 'break') then
    raise exception 'Invalid phase';
  end if;

  if not exists (
    select 1 from public.focus_sessions
    where id = p_session_id
      and host_id = auth.uid()
      and is_active = true
  ) then
    raise exception 'Only the host can advance the session';
  end if;

  update public.focus_sessions
  set phase = p_phase, phase_started_at = now()
  where id = p_session_id
  returning * into result;

  return result;
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
  set phase = 'idle', is_active = false, phase_started_at = null
  where id = p_session_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.start_focus_session(uuid) to authenticated;
grant execute on function public.advance_focus_session(uuid, public.session_phase) to authenticated;
grant execute on function public.end_focus_session(uuid) to authenticated;
