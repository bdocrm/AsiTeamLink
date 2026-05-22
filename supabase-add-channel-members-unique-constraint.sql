-- Ensure unique constraint/index exists for channel_members(channel_id, user_id)
-- Run this in your Supabase SQL editor to satisfy ON CONFLICT(column_list) clauses

BEGIN;

-- Create unique index if missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_members_channel_user ON public.channel_members(channel_id, user_id);

COMMIT;

-- Verify with:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'channel_members';