-- ============================================
-- AsiTeamLink - "Seen By" Read Receipts Migration
-- Run this in your Supabase SQL Editor
-- ============================================

-- Ensure channel_reads table exists (may already exist)
CREATE TABLE IF NOT EXISTS channel_reads (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at timestamp WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

-- Disable RLS (we use RPC functions)
ALTER TABLE channel_reads DISABLE ROW LEVEL SECURITY;

-- RPC: Get who has read/seen a channel (for "Seen by" display)
CREATE OR REPLACE FUNCTION get_channel_readers(p_channel_id uuid)
RETURNS TABLE(user_id uuid, user_name varchar, last_read_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT cr.user_id, u.name::varchar AS user_name, cr.last_read_at
    FROM channel_reads cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.channel_id = p_channel_id
    ORDER BY cr.last_read_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_channel_readers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_channel_readers(uuid) TO anon;

-- Enable realtime for channel_reads so we can track updates
-- Add table to publication only if not already present (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel r ON p.oid = r.prpubid
    JOIN pg_class c ON r.prrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'channel_reads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_reads';
  END IF;
END;
$$;
