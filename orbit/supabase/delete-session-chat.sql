-- Run in Supabase SQL Editor — permanent "delete chat for everyone" for sessions.
--
-- Complements the per-user hiding (direct_message_hides / cleared_at watermark):
-- this hard-deletes rows from session_messages so they are gone for ALL
-- participants and never reappear on refresh.
--
-- Permission: the host, or any participant while the host has enabled
-- allow_all_control (same rule as pause/resume/skip via can_control_session).
--
-- RUN ORDER: run supabase/allow-all-participants-control.sql FIRST, then this
-- file. That file creates can_control_session(uuid), which the policy and RPC
-- below call. (As a safety net, this file also ensures the allow_all_control
-- column exists and re-creates can_control_session itself, so it works even
-- if run on its own.)

-- 0) Self-healing definition of the controller check (same body as
-- allow-all-participants-control.sql; harmless no-op if already created there).
-- Also ensures the flag column exists so the function body is valid even if
-- this file is run before allow-all-participants-control.sql.
alter table public.focus_sessions
  add column if not exists allow_all_control boolean not null default false;

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

-- 1) RLS DELETE policy so a direct table delete also works (RPC below is preferred)
drop policy if exists "Controllers can delete session messages" on public.session_messages;
create policy "Controllers can delete session messages"
  on public.session_messages for delete to authenticated
  using (public.can_control_session(session_id));

-- 2) RPC that deletes every message in the session after the permission check.
-- Using SECURITY DEFINER lets allowed participants delete rows they don't own.
create or replace function public.delete_session_chat(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_control_session(p_session_id) then
    raise exception 'Only the host (or participants allowed by the host) can delete the chat';
  end if;

  delete from public.session_messages
  where session_id = p_session_id;
end;
$$;

grant execute on function public.delete_session_chat(uuid) to authenticated;
