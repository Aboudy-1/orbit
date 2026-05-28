-- Run in Supabase SQL Editor — adds focus_duration and break_duration preferences to profiles.

alter table public.profiles
  add column if not exists focus_duration int not null default 25 check (focus_duration between 1 and 120);

alter table public.profiles
  add column if not exists break_duration int not null default 5 check (break_duration between 1 and 60);