-- ============================================
-- AsiTeamLink - Reply & Reactions Migration
-- Run this in your Supabase SQL Editor
-- ============================================

-- Add reply_to_id column to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON messages(reply_to_id);

-- Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji varchar(10) NOT NULL,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON message_reactions(user_id);

-- Disable RLS on reactions (we use RPC functions)
ALTER TABLE message_reactions DISABLE ROW LEVEL SECURITY;

-- RPC: Toggle a reaction (add if not exists, remove if exists)
CREATE OR REPLACE FUNCTION toggle_reaction(p_message_id uuid, p_user_id uuid, p_emoji varchar)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id uuid;
  old_emoji varchar;
BEGIN
  -- Check if user already reacted with this exact emoji
  SELECT id INTO existing_id FROM message_reactions
    WHERE message_id = p_message_id AND user_id = p_user_id AND emoji = p_emoji;

  IF existing_id IS NOT NULL THEN
    -- Same emoji clicked again = remove it
    DELETE FROM message_reactions WHERE id = existing_id;
    RETURN json_build_object('action', 'removed');
  ELSE
    -- Remove any previous reaction by this user on this message (one reaction at a time)
    DELETE FROM message_reactions
      WHERE message_id = p_message_id AND user_id = p_user_id;
    -- Add the new reaction
    INSERT INTO message_reactions (message_id, user_id, emoji)
      VALUES (p_message_id, p_user_id, p_emoji);
    RETURN json_build_object('action', 'added');
  END IF;
END;
$$;

-- RPC: Get reactions for messages in a channel
CREATE OR REPLACE FUNCTION get_reactions_for_channel(p_channel_id uuid)
RETURNS TABLE(message_id uuid, emoji varchar, user_id uuid, user_name varchar)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT mr.message_id, mr.emoji, mr.user_id, u.name::varchar AS user_name
    FROM message_reactions mr
    JOIN messages m ON m.id = mr.message_id
    JOIN users u ON u.id = mr.user_id
    WHERE m.channel_id = p_channel_id
    ORDER BY mr.created_at ASC;
END;
$$;
