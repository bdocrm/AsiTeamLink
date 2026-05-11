-- AsiTeamLink - Audit & Attachment Tracking Fixes
-- This migration fixes deleted message logging and adds file attachment audit tracking

-- ============================================
-- 1. ADD ATTACHMENT TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attachment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  attachment_name TEXT NOT NULL,
  attachment_url TEXT,
  attachment_size INTEGER,
  action_type TEXT NOT NULL, -- 'uploaded', 'downloaded', 'deleted'
  download_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL, -- who downloaded it
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachment_logs_message_id ON attachment_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_attachment_logs_channel_id ON attachment_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_attachment_logs_user_id ON attachment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attachment_logs_action_type ON attachment_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_attachment_logs_created_at ON attachment_logs(created_at DESC);

ALTER TABLE attachment_logs DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. FUNCTION TO LOG ATTACHMENT UPLOADS
-- ============================================
CREATE OR REPLACE FUNCTION log_attachment_upload(
  p_message_id uuid,
  p_channel_id uuid,
  p_user_id uuid,
  p_attachment_name TEXT,
  p_attachment_url TEXT,
  p_attachment_size INTEGER
)
RETURNS void AS $$
BEGIN
  INSERT INTO attachment_logs (
    message_id,
    channel_id,
    user_id,
    attachment_name,
    attachment_url,
    attachment_size,
    action_type
  ) VALUES (
    p_message_id,
    p_channel_id,
    p_user_id,
    p_attachment_name,
    p_attachment_url,
    p_attachment_size,
    'uploaded'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. FUNCTION TO LOG ATTACHMENT DOWNLOADS
-- ============================================
CREATE OR REPLACE FUNCTION log_attachment_download(
  p_message_id uuid,
  p_attachment_name TEXT,
  p_download_by_user_id uuid
)
RETURNS void AS $$
DECLARE
  v_attachment attachment_logs;
BEGIN
  -- Get the latest upload record for this message
  SELECT * INTO v_attachment FROM attachment_logs
  WHERE message_id = p_message_id
    AND attachment_name = p_attachment_name
    AND action_type = 'uploaded'
  ORDER BY created_at DESC LIMIT 1;
  
  IF v_attachment IS NOT NULL THEN
    INSERT INTO attachment_logs (
      message_id,
      channel_id,
      user_id,
      attachment_name,
      attachment_url,
      attachment_size,
      action_type,
      download_by_user_id
    ) VALUES (
      v_attachment.message_id,
      v_attachment.channel_id,
      v_attachment.user_id,
      v_attachment.attachment_name,
      v_attachment.attachment_url,
      v_attachment.attachment_size,
      'downloaded',
      p_download_by_user_id
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. UPDATE delete_message RPC TO LOG DELETIONS
-- ============================================
DROP FUNCTION IF EXISTS delete_message(uuid);
CREATE OR REPLACE FUNCTION delete_message(p_message_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_user_id uuid;
  v_message messages;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get message details
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  
  -- Check authorization: only sender or admin can delete
  IF v_current_user_id != v_message.sender_id AND 
     (SELECT role FROM users WHERE id = v_current_user_id) != 'admin' THEN
    RAISE EXCEPTION 'Not authorized to delete this message';
  END IF;
  
  -- LOG THE DELETION TO AUDIT_LOGS
  PERFORM log_message_deletion(p_message_id, v_current_user_id, 'Message deleted');
  
  -- Soft delete the message
  UPDATE messages
  SET 
    text = NULL,
    attachment_url = NULL,
    attachment_name = NULL,
    attachment_size = NULL,
    reply_to_id = NULL,
    is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = v_current_user_id
  WHERE id = p_message_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION log_attachment_upload(uuid, uuid, uuid, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION log_attachment_download(uuid, TEXT, uuid) TO authenticated;

-- ============================================
-- 5. CREATE VIEW FOR ATTACHMENT AUDIT
-- ============================================
CREATE OR REPLACE VIEW attachment_audit_view AS
SELECT 
  al.id,
  al.message_id,
  al.channel_id,
  al.user_id,
  u.name as uploaded_by,
  u.email as uploaded_by_email,
  al.attachment_name,
  al.attachment_size,
  al.action_type,
  du.name as download_by,
  du.email as download_by_email,
  al.created_at,
  c.name as channel_name
FROM attachment_logs al
LEFT JOIN users u ON al.user_id = u.id
LEFT JOIN users du ON al.download_by_user_id = du.id
LEFT JOIN channels c ON al.channel_id = c.id
ORDER BY al.created_at DESC;

GRANT SELECT ON attachment_audit_view TO authenticated;
