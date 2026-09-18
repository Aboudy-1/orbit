-- Run in Supabase SQL Editor — tags each break-chat message with the break it
-- was sent in, so the UI can show only the current break's chat and reveal
-- earlier breaks on demand ("show previous breaks") without deleting anything.
--
-- Why a column (not a timestamp comparison): the reset boundary must survive
-- page refreshes, late joiners, and realtime reconnects. focus_sessions only
-- stores the CURRENT phase's phase_started_at, so once a new break starts the
-- old boundary is gone. A persisted break_started_at on each message makes
-- "current break" vs "previous breaks" an exact, server-side grouping.

alter table public.session_messages
  add column if not exists break_started_at timestamptz;

-- Backfill: messages sent while a session is (or was) in break belong to the
-- break that was running when they were created. We can only recover the
-- current break's boundary from focus_sessions, so attribute pre-migration
-- messages to "now" when the session is in break (keeps them visible as the
-- current break), and leave focus/idle-time messages null (treated as
-- previous history when it exists).
update public.session_messages m
set break_started_at = fs.phase_started_at
from public.focus_sessions fs
where m.session_id = fs.id
  and m.break_started_at is null
  and fs.phase = 'break'
  and fs.phase_started_at is not null;

create index if not exists session_messages_break_idx
  on public.session_messages (session_id, break_started_at, created_at);

-- Stamp new messages with the break they were sent in. The RPC path sets it
-- from the session's phase_started_at; the trigger covers direct inserts
-- (the api.ts fallback path) so both write paths behave identically.
create or replace function public.stamp_break_started_at()
returns trigger
language plpgsql
as $$
declare
  v_phase public.session_phase;
  v_started timestamptz;
begin
  if new.break_started_at is not null then
    return new;
  end if;

  select fs.phase, fs.phase_started_at into v_phase, v_started
  from public.focus_sessions fs
  where fs.id = new.session_id;

  if v_phase = 'break' and v_started is not null then
    new.break_started_at := v_started;
  end if;

  return new;
end;
$$;

drop trigger if exists session_messages_stamp_break on public.session_messages;
create trigger session_messages_stamp_break
  before insert on public.session_messages
  for each row execute function public.stamp_break_started_at();

-- Keep send_break_message stamping the row explicitly so realtime payloads
-- carry break_started_at immediately (no refetch needed for the grouping).
create or replace function public.send_break_message(
  p_session_id uuid,
  p_content text
)
returns public.session_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text;
  result public.session_messages;
  v_phase public.session_phase;
  v_started timestamptz;
begin
  trimmed := trim(p_content);
  if char_length(trimmed) < 1 or char_length(trimmed) > 500 then
    raise exception 'Message must be 1–500 characters';
  end if;

  if not exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session_id and sp.user_id = auth.uid()
  )
  and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.current_session_id = p_session_id
  ) then
    raise exception 'You are not a participant of this session';
  end if;

  select fs.phase, fs.phase_started_at into v_phase, v_started
  from public.focus_sessions fs
  where fs.id = p_session_id;

  insert into public.session_messages (session_id, user_id, content, break_started_at)
  values (
    p_session_id,
    auth.uid(),
    trimmed,
    case when v_phase = 'break' then v_started else null end
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_break_message(uuid, text) to authenticated;