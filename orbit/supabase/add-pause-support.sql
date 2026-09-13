-- Run in Supabase SQL Editor — adds pause/resume support to focus_sessions.

alter table public.focus_sessions
  add column if not exists is_paused boolean not null default false;

alter table public.focus_sessions
  add column if not exists paused_at timestamptz;