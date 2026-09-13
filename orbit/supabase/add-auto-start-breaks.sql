-- Run in Supabase SQL Editor — adds auto_start_breaks preference to profiles.

alter table public.profiles
  add column if not exists auto_start_breaks boolean not null default true;