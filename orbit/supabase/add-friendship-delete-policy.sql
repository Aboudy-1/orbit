-- Run in Supabase SQL Editor — adds DELETE policy for friendships.

create policy "Users can delete their own friendships"
  on public.friendships for delete to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);