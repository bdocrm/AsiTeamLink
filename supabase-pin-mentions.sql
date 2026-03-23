-- ============================================
-- AsiTeamLink - Pin Messages & Mentions Migration
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create pinned_messages table
CREATE TABLE IF NOT EXISTS pinned_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  pinned_at timestamp WITH TIME ZONE DEFAULT now(),
  UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_channel_id ON pinned_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_pinned_by ON pinned_messages(pinned_by);

-- Create message_mentions table
CREATE TABLE IF NOT EXISTS message_mentions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  is_read boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON message_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_message ON message_mentions(message_id);
-- Prevent duplicate mentions for the same message/user
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentions_unique ON message_mentions(message_id, mentioned_user_id);

-- Disable RLS (we use SECURITY DEFINER RPCs)
ALTER TABLE pinned_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE message_mentions DISABLE ROW LEVEL SECURITY;

-- RPC: Toggle pin for a message (pin/unpin)
CREATE OR REPLACE FUNCTION toggle_pin(p_message_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id uuid;
  msg_channel uuid;
BEGIN
  SELECT id INTO existing_id FROM pinned_messages WHERE message_id = p_message_id;

  IF existing_id IS NOT NULL THEN
    DELETE FROM pinned_messages WHERE id = existing_id;
    RETURN json_build_object('action', 'unpinned');
  ELSE
    SELECT channel_id INTO msg_channel FROM messages WHERE id = p_message_id;
    INSERT INTO pinned_messages (message_id, channel_id, pinned_by) VALUES (p_message_id, msg_channel, p_user_id);
    RETURN json_build_object('action', 'pinned');
  END IF;
END;
$$;

-- RPC: Get pinned messages for a channel
CREATE OR REPLACE FUNCTION get_pinned_for_channel(p_channel_id uuid)
RETURNS TABLE(pin_id uuid, message_id uuid, pinned_by uuid, pinned_by_name varchar, pinned_at timestamptz, message_text varchar, sender_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT pm.id, pm.message_id, pm.pinned_by, u.name::varchar AS pinned_by_name, pm.pinned_at, m.text AS message_text, m.sender_id
    FROM pinned_messages pm
    JOIN messages m ON m.id = pm.message_id
    LEFT JOIN users u ON u.id = pm.pinned_by
    WHERE pm.channel_id = p_channel_id
    ORDER BY pm.pinned_at DESC;
END;
$$;

-- RPC: Create mentions for a message given an array of names (case-insensitive match)
CREATE OR REPLACE FUNCTION create_message_mentions(p_message_id uuid, p_names text[])
RETURNS TABLE(mentioned_user_id uuid, mentioned_name varchar)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_names text[] := ARRAY(SELECT lower(x) FROM unnest(p_names) x);
  prefix_patterns text[];
  contains_patterns text[];
BEGIN
  -- build simple prefix/contains patterns from normalized names
  prefix_patterns := ARRAY(SELECT n || '%' FROM unnest(normalized_names) n);
  contains_patterns := ARRAY(SELECT '%' || n || '%' FROM unnest(normalized_names) n);

  -- Insert mentions for matching users, avoid duplicates via unique index
  INSERT INTO message_mentions (message_id, mentioned_user_id)
  SELECT p_message_id, u.id
  FROM users u
  WHERE (
    lower(u.name) = ANY(normalized_names) -- exact match
    OR lower(u.name) LIKE ANY(prefix_patterns) -- name starts with the token (e.g. 'dane' -> 'dane del')
    OR lower(u.email) = ANY(normalized_names)
    OR lower(u.email) LIKE ANY(contains_patterns)
  )
  ON CONFLICT DO NOTHING;

  -- Return the inserted/matched users
  RETURN QUERY
    SELECT u.id, u.name FROM users u
    WHERE (
      lower(u.name) = ANY(normalized_names)
      OR lower(u.name) LIKE ANY(prefix_patterns)
      OR lower(u.email) = ANY(normalized_names)
      OR lower(u.email) LIKE ANY(contains_patterns)
    )
  ORDER BY u.name;
END;
$$;

-- RPC: Get mentions for a user (useful to highlight messages)
CREATE OR REPLACE FUNCTION get_mentions_for_user(p_user_id uuid)
RETURNS TABLE(mention_id uuid, message_id uuid, channel_id uuid, message_text varchar, sender_id uuid, created_at timestamptz, is_read boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT mm.id, mm.message_id, m.channel_id, m.text, m.sender_id, mm.created_at, mm.is_read
    FROM message_mentions mm
    JOIN messages m ON m.id = mm.message_id
    WHERE mm.mentioned_user_id = p_user_id
    ORDER BY mm.created_at DESC;
END;
$$;

-- RPC: Mark a mention as read
CREATE OR REPLACE FUNCTION mark_mention_read(p_mention_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE message_mentions SET is_read = true WHERE id = p_mention_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION toggle_pin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_pin(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_pinned_for_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pinned_for_channel(uuid) TO anon;
GRANT EXECUTE ON FUNCTION create_message_mentions(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_message_mentions(uuid, text[]) TO anon;
GRANT EXECUTE ON FUNCTION get_mentions_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mentions_for_user(uuid) TO anon;
GRANT EXECUTE ON FUNCTION mark_mention_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_mention_read(uuid) TO anon;

-- RPC: Create mentions for a message given an array of user IDs (explicit IDs are more reliable)
CREATE OR REPLACE FUNCTION create_message_mentions_by_ids(p_message_id uuid, p_user_ids uuid[])
RETURNS TABLE(mentioned_user_id uuid, mentioned_name varchar)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert mentions for provided user ids, avoid duplicates via unique index
  INSERT INTO message_mentions (message_id, mentioned_user_id)
  SELECT p_message_id, u_id
  FROM unnest(p_user_ids) u_id
  ON CONFLICT DO NOTHING;

  -- Return the inserted/matched users
  RETURN QUERY
    SELECT u.id, u.name FROM users u WHERE u.id = ANY(p_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION create_message_mentions_by_ids(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_message_mentions_by_ids(uuid, uuid[]) TO anon;

-- Add tables to publication idempotently
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
      AND c.relname = 'pinned_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel r ON p.oid = r.prpubid
    JOIN pg_class c ON r.prrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'message_mentions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_mentions';
  END IF;
END;
$$;
