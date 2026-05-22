-- Migration: Create RPCs for channel membership operations
-- Run this in your Supabase project's SQL editor

BEGIN;

-- create_channel_with_members: used by the client to create a channel and add members
CREATE OR REPLACE FUNCTION public.create_channel_with_members(
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
  -- Check authorization: must be approved and admin/manager/tl or manager/tl of campaign
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND (u.role = 'admin' OR (u.role IN ('manager','tl') AND u.campaign_id = p_campaign_id))
  ) THEN
    RETURN json_build_object('error', 'Unauthorized');
  END IF;

  INSERT INTO public.channels (name, campaign_id, created_by)
  VALUES (p_channel_name, p_campaign_id, auth.uid())
  RETURNING id INTO v_channel_id;

  -- Add creator as owner
  INSERT INTO public.channel_members (channel_id, user_id, role, invited_by)
  VALUES (v_channel_id, auth.uid(), 'owner', auth.uid());

  -- Add provided members
  IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN
    FOREACH v_user_id IN ARRAY p_member_ids LOOP
      INSERT INTO public.channel_members (channel_id, user_id, role, invited_by)
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

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.create_channel_with_members(varchar, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_channel_with_members(varchar, uuid, uuid[]) TO anon;

COMMIT;

-- After running: confirm function exists with
-- SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS definition
-- FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE p.proname = 'create_channel_with_members';
