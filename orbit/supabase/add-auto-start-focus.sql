-- Run in Supabase SQL Editor — adds auto_start_focus preference to profiles.

alter table public.profiles
  add column if not exists auto_start_focus boolean not null default true;