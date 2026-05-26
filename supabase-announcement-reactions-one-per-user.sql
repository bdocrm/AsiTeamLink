-- Enforce one reaction per user per announcement (Discord/Messenger-style).
-- Keep latest reaction when duplicates exist.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY announcement_id, user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.announcements_reactions
)
DELETE FROM public.announcements_reactions r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS announcements_reactions_one_per_user_idx
  ON public.announcements_reactions (announcement_id, user_id);

COMMIT;
