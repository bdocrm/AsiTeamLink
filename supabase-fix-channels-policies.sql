-- Fix RLS SELECT policy for `channels`
-- Run this in your Supabase project's SQL editor to allow admins or campaign members to read channels

BEGIN;

ALTER TABLE IF EXISTS public.channels ENABLE ROW LEVEL SECURITY;

-- Replace any existing select policy
DROP POLICY IF EXISTS "channels_select_policy" ON public.channels;

CREATE POLICY "channels_select_policy" ON public.channels FOR SELECT
USING (
  (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND (
        u.role = 'admin'
        OR u.campaign_id = channels.campaign_id
      )
    )
  )
  OR
  EXISTS (
    SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channels.id AND cm.user_id = auth.uid()
  )
);

COMMIT;

-- Quick diagnostics you can run in SQL editor:
-- 1) List channels for a campaign (replace '<campaign_uuid>'):
--    SELECT * FROM public.channels WHERE campaign_id = '<campaign_uuid>' ORDER BY name;
-- 2) List channel members for a campaign's channels:
--    SELECT cm.* FROM public.channel_members cm JOIN public.channels c ON c.id = cm.channel_id WHERE c.campaign_id = '<campaign_uuid>' ORDER BY cm.joined_at;
-- 3) Show policies:
--    SELECT * FROM pg_policies WHERE tablename = 'channels';

-- After running this migration, refresh Admin UI and try the rename action again.
