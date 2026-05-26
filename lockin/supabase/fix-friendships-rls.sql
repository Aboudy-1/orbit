-- Run this if friends only appear for one user after accepting requests.

drop policy if exists "View own friendships" on public.friendships;

create policy "View own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Creates both friendship rows when the receiver accepts (if not already present)
create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.friend_requests%rowtype;
begin
  select * into fr
  from public.friend_requests
  where id = request_id
    and to_user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found';
  end if;

  update public.friend_requests
  set status = 'accepted'
  where id = request_id;

  insert into public.friendships (user_id, friend_id)
  values (fr.from_user_id, fr.to_user_id), (fr.to_user_id, fr.from_user_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
