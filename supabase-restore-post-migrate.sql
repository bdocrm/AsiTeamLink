-- Migration: Restore post-migration missing objects and data
-- Idempotent: safe to run multiple times

BEGIN;

-- 1) Ensure campaign exists (edit the name if you prefer)
INSERT INTO public.campaigns (id, name)
SELECT 'ffac9c3e-24fe-4550-a127-4755d667ea4b', 'Restored Campaign'
WHERE NOT EXISTS (SELECT 1 FROM public.campaigns WHERE id = 'ffac9c3e-24fe-4550-a127-4755d667ea4b');

-- 2) Ensure channel membership for the creator exists (owner)
INSERT INTO public.channel_members(channel_id, user_id, role, joined_at)
VALUES ('0086f076-dd1d-45ba-99a3-1ffdbd93fb8a', '68f5bc1b-42f7-486f-8e42-30ff48d77b46', 'owner', now())
ON CONFLICT (channel_id, user_id) DO NOTHING;

-- 3) Robust RPC: get_channel_members (returns a display name fallback)
CREATE OR REPLACE FUNCTION public.get_channel_members(p_channel_id uuid)
RETURNS TABLE(user_id uuid, user_name varchar, user_role varchar, member_role varchar, joined_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    cm.user_id,
    COALESCE(u.name, au.raw_user_meta_data->>'name', split_part(au.email,'@',1)) AS user_name,
    u.role,
    cm.role,
    cm.joined_at
  FROM public.channel_members cm
  LEFT JOIN public.users u ON u.id = cm.user_id
  LEFT JOIN auth.users au ON au.id = cm.user_id
  WHERE cm.channel_id = p_channel_id
  ORDER BY cm.role DESC, COALESCE(u.name, au.raw_user_meta_data->>'name', split_part(au.email,'@',1)) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_members(uuid) TO authenticated;

-- 4) Populate missing public.users.name from auth.users (idempotent)
UPDATE public.users u
SET name = COALESCE(au.raw_user_meta_data->>'name', split_part(au.email,'@',1))
FROM auth.users au
WHERE u.id = au.id
  AND (u.name IS NULL OR u.name = '');

-- 5) Ensure messages are included in the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel r
    JOIN pg_publication p ON r.prpubid = p.oid
    JOIN pg_class c ON r.prrelid = c.oid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END$$;

COMMIT;

-- Notes:
-- - Review the inserted campaign name and edit the INSERT above if you want a different name.
-- - This file is idempotent and safe to re-run. It will not overwrite existing rows.
-- - Run this in the Supabase SQL editor for your target project, then refresh your app and try again.

-- 6) Ensure create_channel_with_members RPC exists (simple SQL version)
-- Add helper: add members to a channel (no campaign restriction)
CREATE OR REPLACE FUNCTION public.add_members_to_channel(p_channel_id uuid, p_member_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_member_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role, invited_by, joined_at)
  SELECT p_channel_id, m, 'member', auth.uid(), now()
  FROM unnest(p_member_ids) AS m
  ON CONFLICT (channel_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_members_to_channel(uuid, uuid[]) TO authenticated;

-- Create or replace create_channel_with_members to insert channel, creator as owner, then add members
CREATE OR REPLACE FUNCTION public.create_channel_with_members(p_channel_name text, p_campaign_id uuid, p_member_ids uuid[])
 RETURNS TABLE(id uuid, name character varying, campaign_id uuid, created_by uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.channels (name, campaign_id, created_by)
  VALUES (p_channel_name, p_campaign_id, auth.uid())
  RETURNING id, name, campaign_id, created_by, created_at INTO new_id, name, campaign_id, created_by, created_at;

  -- ensure creator is owner
  INSERT INTO public.channel_members(channel_id, user_id, role, joined_at)
  VALUES (new_id, auth.uid(), 'owner', now())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  -- add provided members globally (no campaign restriction)
  PERFORM public.add_members_to_channel(new_id, p_member_ids);

  RETURN QUERY SELECT new_id, p_channel_name, p_campaign_id, auth.uid(), now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_channel_with_members(text, uuid, uuid[]) TO authenticated;
