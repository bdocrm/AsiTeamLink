-- Add channel scope for announcements so posts can target a specific channel/team.

BEGIN;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS channel_id uuid NULL REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_channel_id ON public.announcements(channel_id);
CREATE INDEX IF NOT EXISTS idx_announcements_campaign_channel_created
  ON public.announcements(campaign_id, channel_id, created_at DESC);

COMMIT;

