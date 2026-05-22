-- Migration: Create missing RPCs used by the app
-- Run this in your Supabase project's SQL editor

BEGIN;

-- get_all_campaigns: returns all campaigns (used by admin UI + client components)
CREATE OR REPLACE FUNCTION public.get_all_campaigns()
RETURNS TABLE(id uuid, name varchar)
LANGUAGE sql
SECURITY DEFINER STABLE
AS $$
  SELECT id, name FROM public.campaigns ORDER BY name;
$$;

-- Grant execute to authenticated (and optionally anon to allow unauthenticated clients)
GRANT EXECUTE ON FUNCTION public.get_all_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_campaigns() TO anon;

COMMIT;

-- After running:
-- 1) Refresh your app and retry the Admin panel. The RPC should return existing campaigns.
-- 2) If any other RPCs are missing (get_unread_counts, get_all_users, get_user_status, etc.), run `supabase-rpc-fix.sql` or the other migration files in this repo.
