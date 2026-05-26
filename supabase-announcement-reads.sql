-- Track per-user read state for announcements.

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);

-- Helper RPC: unread counts per campaign for current user
CREATE OR REPLACE FUNCTION public.get_unread_announcement_counts(p_user_id uuid)
RETURNS TABLE(campaign_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH visible_announcements AS (
    SELECT a.id, a.campaign_id
    FROM public.announcements a
    LEFT JOIN public.channel_members cm
      ON cm.channel_id = a.channel_id
     AND cm.user_id = p_user_id
    JOIN public.users u ON u.id = p_user_id
    WHERE
      -- campaign-wide
      (a.channel_id IS NULL AND u.campaign_id = a.campaign_id)
      OR
      -- channel-targeted, visible to channel members
      (a.channel_id IS NOT NULL AND cm.user_id IS NOT NULL)
      OR
      -- oversight roles
      (u.role IN ('admin', 'compliance'))
  )
  SELECT
    v.campaign_id,
    COUNT(*)::bigint AS unread_count
  FROM visible_announcements v
  LEFT JOIN public.announcement_reads ar
    ON ar.announcement_id = v.id
   AND ar.user_id = p_user_id
  WHERE ar.id IS NULL
  GROUP BY v.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_announcement_counts(uuid) TO authenticated;

COMMIT;

