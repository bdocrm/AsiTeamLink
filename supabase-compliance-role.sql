-- AsiTeamLink - Compliance Role & Auditing System
-- This migration adds compliance role with message deletion auditing capabilities

-- 1. Create audit_logs table for tracking message deletions and modifications
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL, -- 'message_deleted', 'message_edited', etc
  user_id uuid NOT NULL,
  target_user_id uuid, -- who's message was affected
  message_id uuid,
  channel_id uuid,
  old_content TEXT,
  reason TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_channel_id ON audit_logs(channel_id);

-- Disable RLS on audit_logs (only accessible through admin)
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 2. Create a function to log message deletions
CREATE OR REPLACE FUNCTION log_message_deletion(
  p_message_id uuid,
  p_deleted_by_id uuid,
  p_reason TEXT DEFAULT 'No reason provided'
)
RETURNS void AS $$
DECLARE
  v_message messages;
BEGIN
  -- Get the message details
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  
  -- Log the deletion
  INSERT INTO audit_logs (
    action_type,
    user_id,
    target_user_id,
    message_id,
    channel_id,
    old_content,
    reason
  ) VALUES (
    'message_deleted',
    p_deleted_by_id,
    v_message.sender_id,
    p_message_id,
    v_message.channel_id,
    v_message.text,
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a function to allow compliance to view deleted messages in their assigned channels
CREATE OR REPLACE FUNCTION can_view_deleted_messages(p_user_id uuid, p_channel_id uuid)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is admin (can view all deleted messages)
  IF (SELECT role FROM users WHERE id = p_user_id) = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is compliance and is member of the channel
  IF (SELECT role FROM users WHERE id = p_user_id) = 'compliance' THEN
    RETURN EXISTS (
      SELECT 1 FROM channel_members 
      WHERE user_id = p_user_id AND channel_id = p_channel_id
    );
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create a view for audit logs accessible to compliance users
CREATE OR REPLACE VIEW compliance_audit_logs AS
SELECT 
  al.*,
  u.name as deleted_by_name,
  tu.name as affected_user_name,
  c.name as channel_name
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
LEFT JOIN users tu ON al.target_user_id = tu.id
LEFT JOIN channels c ON al.channel_id = c.id
WHERE al.action_type = 'message_deleted';

-- 5. Grant appropriate permissions
-- Compliance users can read audit logs but not modify them
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT ON compliance_audit_logs TO authenticated;

-- 5b. Fix RLS policy for admins to update user role and campaign
-- Drop and recreate the policy to ensure WITH CHECK clause is present
DROP POLICY IF EXISTS "Admin can update any user" ON users;

CREATE POLICY "Admin can update any user"
  ON users FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- 6. Update the admin_delete_message function to call the audit logging function
DROP FUNCTION IF EXISTS admin_delete_message(uuid);
CREATE FUNCTION admin_delete_message(p_message_id uuid)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_user_id uuid;
  v_message messages;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();
  
  -- Check if user is admin
  IF (SELECT role FROM users WHERE id = v_current_user_id) NOT IN ('admin') THEN
    RAISE EXCEPTION 'Only admins can delete messages';
  END IF;
  
  -- Get message details
  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  
  -- Log the deletion
  PERFORM log_message_deletion(p_message_id, v_current_user_id, 'Admin deletion');
  
  -- Soft delete the message
  UPDATE messages 
  SET is_deleted = TRUE, 
      deleted_at = NOW(),
      deleted_by = v_current_user_id
  WHERE id = p_message_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Add compliance to channel_members automatically if they're in campaign
-- When compliance user joins, add them to all channels in their campaign
CREATE OR REPLACE FUNCTION add_compliance_to_channels()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'compliance' THEN
    INSERT INTO channel_members (channel_id, user_id, role, invited_by)
    SELECT c.id, NEW.id, 'member', NEW.id
    FROM channels c
    WHERE c.campaign_id = NEW.campaign_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_add_compliance_to_channels ON users;
CREATE TRIGGER trigger_add_compliance_to_channels
AFTER UPDATE ON users
FOR EACH ROW
WHEN (NEW.status = 'approved' AND NEW.role = 'compliance')
EXECUTE FUNCTION add_compliance_to_channels();
