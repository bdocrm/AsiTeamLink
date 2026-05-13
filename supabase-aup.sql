-- AUP (Acceptable Use Policy) acknowledgment column
-- Run this once in the Supabase SQL Editor

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS aup_accepted_at TIMESTAMPTZ DEFAULT NULL;

-- Optional: index for fast lookup in ChatGuard
CREATE INDEX IF NOT EXISTS idx_users_aup_accepted_at ON public.users (aup_accepted_at);
