-- Run in Supabase SQL Editor — fixes realtime for direct messages.
-- This migration adds the direct_messages table to the realtime publication.
-- (Idempotent — safe to run again)

alter publication supabase_realtime add table public.direct_messages;