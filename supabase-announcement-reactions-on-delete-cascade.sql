-- Migration: make announcements_reactions.announcement_id cascade on delete
-- Run inside a transaction. Safe to re-run (uses IF EXISTS).
BEGIN;

ALTER TABLE announcements_reactions
  DROP CONSTRAINT IF EXISTS announcements_reactions_announcement_id_fkey;

ALTER TABLE announcements_reactions
  ADD CONSTRAINT announcements_reactions_announcement_id_fkey
  FOREIGN KEY (announcement_id)
  REFERENCES announcements(id)
  ON DELETE CASCADE;

COMMIT;

-- Notes:
-- - This ensures deleting a row from `announcements` will automatically remove
--   dependent rows in `announcements_reactions`.
-- - If you prefer an app-level approach, delete reactions first then the
--   announcement within the same transactional flow.
