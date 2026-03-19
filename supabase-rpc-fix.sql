-- ============================================
-- AsiTeamLink - RPC Functions Fix
-- Run this ENTIRE block in Supabase SQL Editor
-- This bypasses RLS completely for user queries
-- ============================================

-- 1) Get current user's profile
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF users AS $$
  SELECT * FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2) Get a user's status by their auth id (for login check)
CREATE OR REPLACE FUNCTION get_user_status(user_id uuid)
RETURNS TABLE(status varchar) AS $$
  SELECT u.status FROM public.users u WHERE u.id = user_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3) Get all users (for admin panel)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS SETOF users AS $$
  SELECT * FROM public.users ORDER BY created_at DESC
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4) Get users by campaign (for member list)
CREATE OR REPLACE FUNCTION get_campaign_members(campaign_uuid uuid)
RETURNS SETOF users AS $$
  SELECT * FROM public.users
  WHERE campaign_id = campaign_uuid AND status = 'approved'
  ORDER BY name
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5) Get users by array of IDs (for chat sender names)
CREATE OR REPLACE FUNCTION get_users_by_ids(user_ids uuid[])
RETURNS SETOF users AS $$
  SELECT * FROM public.users WHERE id = ANY(user_ids)
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 6) Get single user by ID (for chat new message sender)
CREATE OR REPLACE FUNCTION get_user_by_id(user_id uuid)
RETURNS SETOF users AS $$
  SELECT * FROM public.users WHERE id = user_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_users_by_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_id(uuid) TO authenticated;

-- Also grant to anon just in case
GRANT EXECUTE ON FUNCTION get_my_profile() TO anon;
GRANT EXECUTE ON FUNCTION get_user_status(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_all_users() TO anon;
GRANT EXECUTE ON FUNCTION get_campaign_members(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_users_by_ids(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION get_user_by_id(uuid) TO anon;
