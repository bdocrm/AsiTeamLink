-- Backstop for legacy / mixed insert paths:
-- keep author_id synchronized from created_by before NOT NULL enforcement.

BEGIN;

CREATE OR REPLACE FUNCTION public.announcements_sync_author_created_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS NULL AND NEW.author_id IS NOT NULL THEN
    NEW.created_by := NEW.author_id;
  END IF;

  IF NEW.author_id IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.author_id := NEW.created_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announcements_sync_author_created_by_trig ON public.announcements;
CREATE TRIGGER announcements_sync_author_created_by_trig
BEFORE INSERT OR UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.announcements_sync_author_created_by();

UPDATE public.announcements
SET author_id = created_by
WHERE author_id IS NULL AND created_by IS NOT NULL;

COMMIT;
