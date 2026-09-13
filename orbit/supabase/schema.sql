-- Orbit: run this in Supabase SQL Editor (Dashboard → SQL → New query)

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type public.user_status as enum ('available', 'studying', 'break', 'away');
create type public.session_phase as enum ('idle', 'focus', 'break');
create type public.friend_request_status as enum ('pending', 'accepted', 'declined');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  status public.user_status not null default 'available',
  current_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (
    username is null or username ~ '^[a-z0-9_]{3,20}$'
  )
);

-- Focus sessions
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Focus Session',
  focus_duration_sec int not null default 1500 check (focus_duration_sec between 60 and 7200),
  break_duration_sec int not null default 300 check (break_duration_sec between 60 and 1800),
  phase public.session_phase not null default 'idle',
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_current_session_fkey
  foreign key (current_session_id) references public.focus_sessions (id) on delete set null;

-- Session participants
create table public.session_participants (
  session_id uuid not null references public.focus_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- Friend requests
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friend_requests_no_self check (from_user_id <> to_user_id),
  constraint friend_requests_unique_pair unique (from_user_id, to_user_id)
);

-- Friendships (bidirectional rows)
create table public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

-- Session chat (break phase only — enforced in RLS)
create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.focus_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Indexes
create index profiles_username_idx on public.profiles (username);
create index focus_sessions_active_idx on public.focus_sessions (is_active) where is_active;
create index session_messages_session_idx on public.session_messages (session_id, created_at);
create index friend_requests_to_user_idx on public.friend_requests (to_user_id, status);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sync profile status from session phase
create or replace function public.sync_profile_status_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mapped_status public.user_status;
begin
  if new.phase = 'focus' then
    mapped_status := 'studying';
  elsif new.phase = 'break' then
    mapped_status := 'break';
  else
    mapped_status := 'available';
  end if;

  if new.phase = 'idle' or new.is_active = false then
    update public.profiles
    set status = 'available', current_session_id = null
    where current_session_id = new.id;
  else
    update public.profiles
    set status = mapped_status, current_session_id = new.id
    where current_session_id = new.id;
  end if;

  return new;
end;
$$;

create trigger focus_sessions_sync_profiles
  after update of phase, is_active on public.focus_sessions
  for each row execute function public.sync_profile_status_from_session();

-- RLS
alter table public.profiles enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.session_messages enable row level security;

-- Profiles policies
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

-- Focus sessions
create policy "Authenticated users can view sessions"
  on public.focus_sessions for select to authenticated using (true);

create policy "Users can create sessions"
  on public.focus_sessions for insert to authenticated
  with check (auth.uid() = host_id);

create policy "Host can update session"
  on public.focus_sessions for update to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- Session participants
create policy "View participants of visible sessions"
  on public.session_participants for select to authenticated using (true);

create policy "Users can join sessions"
  on public.session_participants for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can leave sessions"
  on public.session_participants for delete to authenticated
  using (auth.uid() = user_id);

-- Friend requests
create policy "View own friend requests"
  on public.friend_requests for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Send friend requests"
  on public.friend_requests for insert to authenticated
  with check (auth.uid() = from_user_id and status = 'pending');

create policy "Receiver can update request"
  on public.friend_requests for update to authenticated
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

-- Friendships
create policy "View own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Create friendships for self"
  on public.friendships for insert to authenticated
  with check (auth.uid() = user_id);

-- Session messages
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

create policy "Send messages during break if in session"
  on public.session_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.session_participants sp
      where sp.session_id = session_messages.session_id
        and sp.user_id = auth.uid()
    )
    and exists (
      select 1 from public.focus_sessions fs
      where fs.id = session_messages.session_id
        and fs.phase = 'break'
        and fs.is_active = true
    )
  );

-- Accept friend request (creates both friendship rows; bypasses RLS safely)
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

-- Session timer controls (host only; returns updated row for clients)
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

grant execute on function public.start_focus_session(uuid) to authenticated;
grant execute on function public.advance_focus_session(uuid, public.session_phase) to authenticated;
grant execute on function public.sync_focus_session_phase(uuid) to authenticated;
grant execute on function public.end_focus_session(uuid) to authenticated;

-- Break chat (server checks phase + membership; returns inserted row)
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

-- Realtime: run each line in SQL Editor (skip if already added)
-- alter publication supabase_realtime add table public.profiles;
-- alter publication supabase_realtime add table public.focus_sessions;
-- alter publication supabase_realtime add table public.session_participants;
-- alter publication supabase_realtime add table public.session_messages;
-- alter publication supabase_realtime add table public.friend_requests;
-- alter publication supabase_realtime add table public.friendships;
