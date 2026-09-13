-- Run in Supabase SQL Editor — adds timer sound preferences to profiles.

alter table public.profiles
  add column if not exists timer_sound text not null default 'bell'
  check (timer_sound in ('bell', 'chime', 'digital', 'gentle', 'custom', 'none'));

alter table public.profiles
  add column if not exists timer_volume int not null default 80
  check (timer_volume between 0 and 100);
