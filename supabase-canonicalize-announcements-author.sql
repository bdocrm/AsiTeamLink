-- Migration: Ensure `author_id` exists and is synchronized with `created_by`
-- Idempotent: safe to run multiple times

BEGIN;

-- 1) Add `author_id` if missing
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS author_id uuid;

-- 2) Backfill `author_id` from `created_by` when present
UPDATE public.announcements
SET author_id = created_by
WHERE author_id IS NULL AND created_by IS NOT NULL;

-- 3) Backfill `created_by` from `author_id` when present
UPDATE public.announcements
SET created_by = author_id
WHERE created_by IS NULL AND author_id IS NOT NULL;

-- 4) Create trigger function to keep author_id and created_by in sync
CREATE OR REPLACE FUNCTION public.announcements_sync_author_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If created_by is not provided but author_id is, use author_id
  IF (NEW.created_by IS NULL OR NEW.created_by = '') AND (NEW.author_id IS NOT NULL) THEN
    NEW.created_by := NEW.author_id;
  END IF;

  -- Keep legacy `author_id` column in sync with `created_by`
  NEW.author_id := NEW.created_by;

  RETURN NEW;
END;
$$;

-- 5) Install trigger if not present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'announcements') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'announcements_sync_author_created_by_trig' AND c.relname = 'announcements'
    ) THEN
      CREATE TRIGGER announcements_sync_author_created_by_trig
      BEFORE INSERT OR UPDATE ON public.announcements
      FOR EACH ROW
      EXECUTE FUNCTION public.announcements_sync_author_created_by();
    END IF;
  END IF;
END$$;

COMMIT;

-- Notes:
-- - Run this in the Supabase SQL editor. The trigger runs BEFORE INSERT/UPDATE
--   and will populate `author_id` from `created_by` (or vice versa) so inserts
--   that provide only one of the columns succeed.
