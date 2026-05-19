-- Ensure announcements are readable by all users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'announcements' AND policyname = 'allow_select_all'
  ) THEN
    CREATE POLICY allow_select_all
      ON public.announcements
      FOR SELECT
      TO public
      USING (true);
  END IF;
END$$;
