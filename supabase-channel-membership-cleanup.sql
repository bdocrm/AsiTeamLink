-- ============================================
-- Cleanup Script - Run this FIRST if you get policy errors
-- ============================================

-- Drop policies safely
DO $$ 
BEGIN
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
  
  DROP FUNCTION IF EXISTS create_channel_with_members(varchar, uuid, uuid[]);
  DROP FUNCTION IF EXISTS add_channel_member(uuid, uuid);
  DROP FUNCTION IF EXISTS remove_channel_member(uuid, uuid);
  DROP FUNCTION IF EXISTS get_channel_members(uuid);
  DROP FUNCTION IF EXISTS get_my_channels();
  
  DROP TABLE IF EXISTS channel_members;
  
  RAISE NOTICE 'Cleanup complete. Now run supabase-channel-membership.sql';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cleanup error (may be normal): %', SQLERRM;
END $$;
