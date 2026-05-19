-- Ensure announcements table has required columns
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
