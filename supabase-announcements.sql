-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  title text,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Optional index
CREATE INDEX IF NOT EXISTS announcements_campaign_idx ON public.announcements (campaign_id);
