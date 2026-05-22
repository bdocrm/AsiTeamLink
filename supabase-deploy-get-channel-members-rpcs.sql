-- Migration: Create RPCs get_channel_members and get_my_channels
-- Run this in your Supabase project's SQL editor

BEGIN;

-- get_channel_members: returns members for a channel
CREATE OR REPLACE FUNCTION public.get_channel_members(p_channel_id uuid)
RETURNS TABLE(user_id uuid, user_name varchar, user_role varchar, member_role varchar, joined_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT cm.user_id, u.name, u.role, cm.role, cm.joined_at
  FROM public.channel_members cm
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.channel_id = p_channel_id
  ORDER BY cm.role DESC, u.name ASC;
$$;

-- get_my_channels: returns channels the caller is a member of
CREATE OR REPLACE FUNCTION public.get_my_channels()
RETURNS TABLE(id uuid, name varchar, campaign_id uuid, created_by uuid, created_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT c.id, c.name, c.campaign_id, c.created_by, c.created_at
  FROM public.channels c
  JOIN public.channel_members cm ON cm.channel_id = c.id
  WHERE cm.user_id = auth.uid()
  ORDER BY c.created_at DESC;
$$;

-- Grant execute to authenticated (and anon if desired)
GRANT EXECUTE ON FUNCTION public.get_channel_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_members(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_channels() TO anon;

COMMIT;

-- Verify with:
-- SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS definition
-- FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE p.proname IN ('get_channel_members','get_my_channels');
