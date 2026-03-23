-- ============================================
-- AsiTeamLink - Channel Membership & Access Control
-- Restricts channel visibility to assigned members only
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create channel_members table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamp WITH TIME ZONE DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_channel ON channel_members(user_id, channel_id);

-- Disable RLS on channel_members (we'll control via policies on channels/messages)
ALTER TABLE channel_members DISABLE ROW LEVEL SECURITY;

-- ============================================
-- UPDATE CHANNELS RLS POLICIES
-- ============================================

-- Drop old policies (safely)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read channels in their campaign" ON channels;
  DROP POLICY IF EXISTS "Admin, Manager, TL can create channels" ON channels;
  DROP POLICY IF EXISTS "Admin can delete channels" ON channels;
  DROP POLICY IF EXISTS "Users can read channels they are members of" ON channels;
  DROP POLICY IF EXISTS "Managers and admins can create channels" ON channels;
  DROP POLICY IF EXISTS "Admin can delete channels (new)" ON channels;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore errors if table doesn't exist yet
END $$;

-- New: Users can read channels they're members of
CREATE POLICY "Users can read channels they are members of"
  ON channels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = channels.id
      AND cm.user_id = auth.uid()
    )
  );

-- Managers and admins in the campaign can create channels
CREATE POLICY "Managers and admins can create channels"
  ON channels FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM users u
      WHERE u.status = 'approved'
      AND (u.role IN ('admin', 'manager', 'tl'))
      AND (u.role = 'admin' OR u.campaign_id = channels.campaign_id)
    )
  );

-- Admin can delete channels
CREATE POLICY "Admin can delete channels (new)"
  ON channels FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ============================================
-- UPDATE MESSAGES RLS POLICIES
-- ============================================

-- Drop old policies (safely)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read messages in their campaign channels" ON messages;
  DROP POLICY IF EXISTS "Approved users can send messages" ON messages;
  DROP POLICY IF EXISTS "Users can read messages in their channels" ON messages;
  DROP POLICY IF EXISTS "Members can send messages to their channels" ON messages;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore errors if table doesn't exist yet
END $$;

-- New: Users can read messages only in channels they're members of
CREATE POLICY "Users can read messages in their channels"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id
      WHERE c.id = messages.channel_id
      AND cm.user_id = auth.uid()
    )
  );

-- Users can send messages to channels they're members of
CREATE POLICY "Members can send messages to their channels"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM channel_members cm
      WHERE cm.channel_id = channel_id
      AND cm.user_id = auth.uid()
    )
  );

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Function to create channel with manager and add initial members
CREATE OR REPLACE FUNCTION create_channel_with_members(
  p_channel_name varchar,
  p_campaign_id uuid,
  p_member_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id uuid;
  v_user_id uuid;
  v_result json;
BEGIN
  -- Verify caller is manager, admin, or TL in the campaign
  -- Admins can create in any campaign, others must be in the campaign
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'approved'
    AND (
      u.role = 'admin'  -- Admins can create in any campaign
      OR (u.role IN ('manager', 'tl') AND u.campaign_id = p_campaign_id)  -- Managers/TLs must be in the campaign
    )
  ) THEN
    RETURN json_build_object('error', 'Unauthorized: only admins/managers/TLs can create channels');
  END IF;

  -- Create the channel
  INSERT INTO channels (name, campaign_id, created_by)
  VALUES (p_channel_name, p_campaign_id, auth.uid())
  RETURNING id INTO v_channel_id;

  -- Add creator as owner
  INSERT INTO channel_members (channel_id, user_id, role, invited_by)
  VALUES (v_channel_id, auth.uid(), 'owner', auth.uid());

  -- Add other members
  FOREACH v_user_id IN ARRAY p_member_ids
  LOOP
    BEGIN
      INSERT INTO channel_members (channel_id, user_id, role, invited_by)
      VALUES (v_channel_id, v_user_id, 'member', auth.uid())
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Silently skip invalid user IDs
      NULL;
    END;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'channel_id', v_channel_id,
    'channel_name', p_channel_name,
    'member_count', array_length(p_member_ids, 1) + 1
  );
END;
$$;

-- Function to add member to channel
CREATE OR REPLACE FUNCTION add_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_name varchar;
BEGIN
  -- Verify caller is channel owner or admin
  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'moderator')
  ) AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Unauthorized: only channel owners/admins can add members');
  END IF;

  -- Get user name
  SELECT name INTO v_user_name FROM users WHERE id = p_user_id;
  IF v_user_name IS NULL THEN
    RETURN json_build_object('error', 'User not found');
  END IF;

  -- Add member
  INSERT INTO channel_members (channel_id, user_id, role, invited_by)
  VALUES (p_channel_id, p_user_id, 'member', auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'user_name', v_user_name,
    'message', 'Member added successfully'
  );
END;
$$;

-- Function to remove member from channel
CREATE OR REPLACE FUNCTION remove_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is channel owner or admin
  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'moderator')
  ) AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  -- Prevent owner from removing themselves
  IF p_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id
    AND user_id = auth.uid()
    AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Cannot remove channel owner');
  END IF;

  DELETE FROM channel_members
  WHERE channel_id = p_channel_id AND user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Member removed');
END;
$$;

-- Function to get channel members with details
CREATE OR REPLACE FUNCTION get_channel_members(p_channel_id uuid)
RETURNS TABLE(user_id uuid, user_name varchar, user_role varchar, member_role varchar, joined_at timestamp WITH TIME ZONE)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    cm.user_id,
    u.name,
    u.role,
    cm.role,
    cm.joined_at
  FROM channel_members cm
  JOIN users u ON u.id = cm.user_id
  WHERE cm.channel_id = p_channel_id
  ORDER BY cm.role DESC, u.name ASC;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_channel_with_members(varchar, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION add_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_channel_members(uuid) TO authenticated;

-- Function to get channels the current user is a member of
CREATE OR REPLACE FUNCTION get_my_channels()
RETURNS TABLE(id uuid, name varchar, campaign_id uuid, created_by uuid, created_at timestamp WITH TIME ZONE)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT DISTINCT
    c.id,
    c.name,
    c.campaign_id,
    c.created_by,
    c.created_at
  FROM channels c
  JOIN channel_members cm ON cm.channel_id = c.id
  WHERE cm.user_id = auth.uid()
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_my_channels() TO authenticated;
