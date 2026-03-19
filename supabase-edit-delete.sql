-- ============================================
-- AsiTeamLink - Edit & Delete (admin) Migration
-- Run this in your Supabase SQL Editor
-- ============================================

-- Add columns to support edit/delete metadata
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamp WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamp WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_edited_by ON messages(edited_by);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_by ON messages(deleted_by);

-- RPC: Edit a message (owner or admin) — records edit metadata
CREATE OR REPLACE FUNCTION edit_message(p_message_id uuid, p_text text)
RETURNS SETOF messages
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid();
  msg_sender uuid;
  caller_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT sender_id INTO msg_sender FROM messages WHERE id = p_message_id;
  SELECT role INTO caller_role FROM users WHERE id = caller;

  IF caller = msg_sender OR caller_role = 'admin' THEN
    UPDATE messages SET text = p_text, edited_at = now(), edited_by = caller WHERE id = p_message_id;
    RETURN QUERY SELECT * FROM messages WHERE id = p_message_id;
  ELSE
    RAISE EXCEPTION 'Not authorized to edit this message';
  END IF;
END;
$$;

-- RPC: Admin edit without leaving a trace (admin only)
CREATE OR REPLACE FUNCTION admin_edit_message(p_message_id uuid, p_text text)
RETURNS SETOF messages
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = caller;
  IF caller_role = 'admin' THEN
    -- Overwrite text but clear edit metadata
    UPDATE messages SET text = p_text, edited_at = NULL, edited_by = NULL WHERE id = p_message_id;
    RETURN QUERY SELECT * FROM messages WHERE id = p_message_id;
  ELSE
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
END;
$$;

-- RPC: Soft-delete a message (owner or admin) — clears content but keeps row
CREATE OR REPLACE FUNCTION delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid();
  msg_sender uuid;
  caller_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT sender_id INTO msg_sender FROM messages WHERE id = p_message_id;
  SELECT role INTO caller_role FROM users WHERE id = caller;

  IF caller = msg_sender OR caller_role = 'admin' THEN
    UPDATE messages
    SET text = NULL,
        attachment_url = NULL,
        attachment_name = NULL,
        attachment_size = NULL,
        reply_to_id = NULL,
        is_deleted = true,
        deleted_at = now(),
        deleted_by = caller
    WHERE id = p_message_id;
  ELSE
    RAISE EXCEPTION 'Not authorized to delete this message';
  END IF;
END;
$$;

-- RPC: Admin permanent delete (admin only) — removes row entirely
CREATE OR REPLACE FUNCTION admin_delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_role text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = caller;
  IF caller_role = 'admin' THEN
    DELETE FROM messages WHERE id = p_message_id;
  ELSE
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION edit_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION edit_message(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION admin_edit_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_edit_message(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION delete_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_message(uuid) TO anon;
GRANT EXECUTE ON FUNCTION admin_delete_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_message(uuid) TO anon;
