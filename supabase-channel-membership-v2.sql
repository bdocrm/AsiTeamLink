-- ============================================
-- AsiTeamLink - Channel Membership & Access Control
-- Version 2 - Clean and Simplified
-- ============================================

-- 1. Create channel_members table
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamp WITH TIME ZONE DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_channel ON channel_members(user_id, channel_id);

ALTER TABLE channel_members DISABLE ROW LEVEL SECURITY;

-- 2. Drop old RLS policies safely
BEGIN;
DROP POLICY IF EXISTS "Users can read channels in their campaign" ON channels;
DROP POLICY IF EXISTS "Admin, Manager, TL can create channels" ON channels;
DROP POLICY IF EXISTS "Admin can delete channels" ON channels;
DROP POLICY IF EXISTS "Users can read channels they are members of" ON channels;
DROP POLICY IF EXISTS "Managers and admins can create channels" ON channels;
DROP POLICY IF EXISTS "Admin can delete channels (new)" ON channels;

DROP POLICY IF EXISTS "Users can read messages in their campaign channels" ON messages;
DROP POLICY IF EXISTS "Approved users can send messages" ON messages;
DROP POLICY IF EXISTS "Users can read messages in their channels" ON messages;
DROP POLICY IF EXISTS "Members can send messages to their channels" ON messages;
COMMIT;

-- 3. Create new CHANNELS RLS policies
CREATE POLICY "channels_select_policy" ON channels FOR SELECT
USING (
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = channels.id AND user_id = auth.uid())
);

CREATE POLICY "channels_insert_policy" ON channels FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM users 
    WHERE status = 'approved' 
    AND role IN ('admin', 'manager', 'tl')
  )
);

CREATE POLICY "channels_delete_policy" ON channels FOR DELETE
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- 4. Create new MESSAGES RLS policies
CREATE POLICY "messages_select_policy" ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM channels c
    JOIN channel_members cm ON cm.channel_id = c.id
    WHERE c.id = messages.channel_id AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "messages_insert_policy" ON messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM channel_members 
    WHERE channel_id = messages.channel_id AND user_id = auth.uid()
  )
);

-- 5. Drop old RPC functions safely
DROP FUNCTION IF EXISTS create_channel_with_members(varchar, uuid, uuid[]);
DROP FUNCTION IF EXISTS add_channel_member(uuid, uuid);
DROP FUNCTION IF EXISTS remove_channel_member(uuid, uuid);
DROP FUNCTION IF EXISTS get_channel_members(uuid);
DROP FUNCTION IF EXISTS get_my_channels();

-- 6. Create RPC: create_channel_with_members
CREATE FUNCTION create_channel_with_members(
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
BEGIN
  -- Check authorization
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.status = 'approved'
    AND (u.role = 'admin' OR (u.role IN ('manager', 'tl') AND u.campaign_id = p_campaign_id))
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  -- Create channel
  INSERT INTO channels (name, campaign_id, created_by)
  VALUES (p_channel_name, p_campaign_id, auth.uid())
  RETURNING id INTO v_channel_id;

  -- Add creator
  INSERT INTO channel_members (channel_id, user_id, role, invited_by)
  VALUES (v_channel_id, auth.uid(), 'owner', auth.uid());

  -- Add members
  IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN
    FOREACH v_user_id IN ARRAY p_member_ids LOOP
      INSERT INTO channel_members (channel_id, user_id, role, invited_by)
      VALUES (v_channel_id, v_user_id, 'member', auth.uid())
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success', true,
    'channel_id', v_channel_id,
    'member_count', COALESCE(array_length(p_member_ids, 1), 0) + 1
  );
END;
$$;

-- 7. Create RPC: add_channel_member
CREATE FUNCTION add_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

  INSERT INTO channel_members (channel_id, user_id, role, invited_by)
  VALUES (p_channel_id, p_user_id, 'member', auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$$;

-- 8. Create RPC: remove_channel_member
CREATE FUNCTION remove_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
    AND role IN ('owner', 'moderator')
  ) AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  IF p_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Cannot remove owner');
  END IF;

  DELETE FROM channel_members WHERE channel_id = p_channel_id AND user_id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- 9. Create RPC: get_channel_members
CREATE FUNCTION get_channel_members(p_channel_id uuid)
RETURNS TABLE(user_id uuid, user_name varchar, user_role varchar, member_role varchar, joined_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT cm.user_id, u.name, u.role, cm.role, cm.joined_at
  FROM channel_members cm
  JOIN users u ON u.id = cm.user_id
  WHERE cm.channel_id = p_channel_id
  ORDER BY cm.role DESC, u.name ASC;
$$;

-- 10. Create RPC: get_my_channels
CREATE FUNCTION get_my_channels()
RETURNS TABLE(id uuid, name varchar, campaign_id uuid, created_by uuid, created_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT c.id, c.name, c.campaign_id, c.created_by, c.created_at
  FROM channels c
  JOIN channel_members cm ON cm.channel_id = c.id
  WHERE cm.user_id = auth.uid()
  ORDER BY c.created_at DESC;
$$;

-- 11. Grant permissions
GRANT EXECUTE ON FUNCTION create_channel_with_members(varchar, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION add_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_channel_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_channels() TO authenticated;
