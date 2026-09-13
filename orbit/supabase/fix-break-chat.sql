-- Run in Supabase SQL Editor if break chat fails to send or messages don't appear.

drop policy if exists "View messages if in session" on public.session_messages;

create policy "View messages if in session"
  on public.session_messages for select to authenticated
  using (
    exists (
      select 1 from public.session_participants sp
      where sp.session_id = session_messages.session_id
        and sp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.current_session_id = session_messages.session_id
    )
  );

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
    raise exception 'Join the session before chatting';
  end if;

  if not exists (
    select 1 from public.focus_sessions fs
    where fs.id = p_session_id and fs.phase = 'break' and fs.is_active = true
  ) then
    raise exception 'Chat is only available during breaks';
  end if;

  insert into public.session_messages (session_id, user_id, content)
  values (p_session_id, auth.uid(), trimmed)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_break_message(uuid, text) to authenticated;

-- alter publication supabase_realtime add table public.session_messages;
