-- Ensure `content` column exists and is non-null for announcements
-- Idempotent: safe to run multiple times

BEGIN;

-- 1) Add column if missing
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS content text;

-- 2) Backfill content from body when available
UPDATE public.announcements
SET content = body
WHERE content IS NULL AND body IS NOT NULL;

-- 3) Make future inserts safe: set default and remove NULLs
ALTER TABLE public.announcements ALTER COLUMN content SET DEFAULT '';
UPDATE public.announcements SET content = '' WHERE content IS NULL;
ALTER TABLE public.announcements ALTER COLUMN content SET NOT NULL;

COMMIT;

-- Notes:
-- - Run this in the Supabase SQL editor for your project.
-- - This makes the `content` column non-nullable and ensures existing rows are populated.
-- - If you prefer to canonicalize on `body` instead, run a migration to add/populate `body` from `content` and update code to use `body`.
