-- Migration: create add_channel_member and remove_channel_member RPCs
-- Run this in your Supabase project's SQL editor

BEGIN;

-- add_channel_member
CREATE OR REPLACE FUNCTION public.add_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'moderator')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  INSERT INTO public.channel_members (channel_id, user_id, role, invited_by)
  VALUES (p_channel_id, p_user_id, 'member', auth.uid())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$$;

-- remove_channel_member
CREATE OR REPLACE FUNCTION public.remove_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
    AND role IN ('owner', 'moderator')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  IF p_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Cannot remove owner');
  END IF;

  DELETE FROM public.channel_members WHERE channel_id = p_channel_id AND user_id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.add_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_channel_member(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.remove_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_channel_member(uuid, uuid) TO anon;

COMMIT;

-- Verify functions with:
-- SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS definition
-- FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE p.proname IN ('add_channel_member','remove_channel_member');
