-- Allow adding channel members across campaigns.
-- Keeps permission checks (admin or channel owner), removes campaign restriction.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_members_to_channel(p_channel_id uuid, p_member_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_owner boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_uid
      AND u.role = 'admin'
  ) INTO v_is_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.channel_members cm
    WHERE cm.channel_id = p_channel_id
      AND cm.user_id = v_uid
      AND cm.role = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role, invited_by, joined_at)
  SELECT p_channel_id, m, 'member', v_uid, now()
  FROM unnest(p_member_ids) AS m
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_members_to_channel(uuid, uuid[]) TO authenticated;

COMMIT;
