-- Cleanup stale zombie sessions where no participants remain
-- Run this in Supabase SQL Editor to clean up existing stale sessions

UPDATE public.focus_sessions
SET is_active = false, phase = 'idle'
WHERE is_active = true
AND id NOT IN (SELECT DISTINCT session_id FROM public.session_participants);