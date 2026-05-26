-- Channel governance: role-scoped posting restrictions
-- Adds channels.posting_mode and enforces it at messages INSERT policy level.

BEGIN;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS posting_mode varchar(20) NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_posting_mode_check'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_posting_mode_check
      CHECK (posting_mode IN ('all', 'leaders_only', 'admin_only'));
  END IF;
END $$;

-- Keep old and current policy names safe to re-run.
DROP POLICY IF EXISTS "Approved users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages to their channels" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;

CREATE POLICY "messages_insert_policy" ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.channel_members cm
    JOIN public.channels c ON c.id = cm.channel_id
    JOIN public.users u ON u.id = auth.uid()
    WHERE cm.channel_id = messages.channel_id
      AND cm.user_id = auth.uid()
      AND u.status = 'approved'
      AND (
        c.posting_mode = 'all'
        OR (c.posting_mode = 'leaders_only' AND u.role IN ('admin', 'manager', 'tl'))
        OR (c.posting_mode = 'admin_only' AND u.role = 'admin')
      )
  )
);

-- Ensure channel RPC returns governance mode to clients.
DROP FUNCTION IF EXISTS public.get_my_channels();

CREATE OR REPLACE FUNCTION public.get_my_channels()
RETURNS TABLE(
  id uuid,
  name varchar,
  campaign_id uuid,
  created_by uuid,
  created_at timestamp with time zone,
  posting_mode varchar
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT c.id, c.name, c.campaign_id, c.created_by, c.created_at, c.posting_mode
  FROM public.channels c
  JOIN public.channel_members cm ON cm.channel_id = c.id
  WHERE cm.user_id = auth.uid()
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_channels() TO anon;

COMMIT;
