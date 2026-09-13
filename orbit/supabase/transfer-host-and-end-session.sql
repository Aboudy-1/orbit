-- Transfer host to another participant or end session when host leaves
-- Run this in Supabase SQL Editor after schema.sql

-- Function to transfer host when the current host leaves
create or replace function public.transfer_session_host(p_session_id uuid, p_old_host_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_host_id uuid;
begin
  -- Find the participant who joined earliest (longest in session)
  select user_id into new_host_id
  from public.session_participants
  where session_id = p_session_id
  order by joined_at asc
  limit 1;

  if new_host_id is not null then
    -- Transfer host to the earliest participant
    update public.focus_sessions
    set host_id = new_host_id
    where id = p_session_id;
  else
    -- No participants remain — end the session (zombie cleanup)
    update public.focus_sessions
    set is_active = false,
        phase = 'idle',
        phase_started_at = null,
        phase_ends_at = null
    where id = p_session_id;
  end if;
end;
$$;

grant execute on function public.transfer_session_host(uuid, uuid) to authenticated;

-- Function to force-end a session (for cleanup of zombie sessions)
create or replace function public.force_end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.focus_sessions
  set is_active = false,
      phase = 'idle',
      phase_started_at = null,
      phase_ends_at = null
  where id = p_session_id;
end;
$$;

grant execute on function public.force_end_session(uuid) to authenticated;