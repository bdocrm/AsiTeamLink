-- Migration: Canonicalize announcements to `body` (make `body` authoritative)
-- Idempotent: safe to run multiple times

BEGIN;

-- 1) Ensure `body` column exists
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS body text;

-- 2) Backfill `body` from `content` when missing
UPDATE public.announcements
SET body = content
WHERE (body IS NULL OR body = '') AND content IS NOT NULL;

-- 3) Ensure `content` is at least populated from `body` for compatibility
UPDATE public.announcements
SET content = body
WHERE content IS NULL AND body IS NOT NULL;

-- 4) Create trigger function to accept legacy inserts that supply `content`
CREATE OR REPLACE FUNCTION public.announcements_sync_body_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If body is not provided but content is, use content as the canonical body
  IF (NEW.body IS NULL OR NEW.body = '') AND (NEW.content IS NOT NULL) THEN
    NEW.body := NEW.content;
  END IF;

  -- Keep legacy `content` column in sync with the canonical `body`
  NEW.content := NEW.body;

  RETURN NEW;
END;
$$;

-- 5) Install trigger (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'announcements') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'announcements_sync_body_content_trig' AND c.relname = 'announcements'
    ) THEN
      CREATE TRIGGER announcements_sync_body_content_trig
      BEFORE INSERT OR UPDATE ON public.announcements
      FOR EACH ROW
      EXECUTE FUNCTION public.announcements_sync_body_content();
    END IF;
  END IF;
END$$;

-- 6) Make `body` non-nullable and set a safe default (idempotent)
ALTER TABLE public.announcements ALTER COLUMN body SET DEFAULT '';
UPDATE public.announcements SET body = '' WHERE body IS NULL;
ALTER TABLE public.announcements ALTER COLUMN body SET NOT NULL;

COMMIT;

-- Notes:
-- - Run this in the Supabase SQL editor for your project.
-- - This makes `body` the authoritative column, backfills data, and keeps `content`
--   synchronized for backward compatibility. After a period of deployment, you
--   may remove the `content` column and the trigger if desired.
