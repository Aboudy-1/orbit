-- Run in Supabase SQL Editor — adds the "repeat alarm" preference to profiles.
-- 1 (default) plays the alert once, up to 5 repeats it after a timer ends.

alter table public.profiles
  add column if not exists alarm_repeat_count int not null default 1
  check (alarm_repeat_count between 1 and 5);
