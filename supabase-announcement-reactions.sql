-- Create announcement reactions table
CREATE TABLE IF NOT EXISTS public.announcements_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL references public.announcements(id) on delete cascade,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_reactions_announcement_idx ON public.announcements_reactions (announcement_id);
CREATE INDEX IF NOT EXISTS announcements_reactions_user_idx ON public.announcements_reactions (user_id);
