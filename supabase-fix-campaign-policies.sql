-- Fix RLS policies for `campaigns`
-- Run this in your Supabase project's SQL editor to ensure admins can manage campaigns

BEGIN;

-- Ensure RLS enabled
ALTER TABLE IF EXISTS public.campaigns ENABLE ROW LEVEL SECURITY;

-- Drop potentially-broken policies
DROP POLICY IF EXISTS "Approved users can read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Admin can manage campaigns" ON public.campaigns;

-- 1) Read policy: allow approved users to SELECT
CREATE POLICY "Approved users can read campaigns" ON public.campaigns FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.status = 'approved'
  )
);

-- 2) Admin manage: allow admins to INSERT/UPDATE/DELETE (both USING and WITH CHECK)
CREATE POLICY "Admin can manage campaigns" ON public.campaigns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

COMMIT;

-- After running: try these tests in SQL editor
-- 1) List policies: SELECT * FROM pg_policies WHERE tablename = 'campaigns';
-- 2) Try inserting via your client (as admin) or from SQL using auth.uid() simulation in the Supabase SQL editor (can't simulate auth.uid() easily from SQL editor).

-- IMPORTANT: If your client is running as anon (browser), the caller must be authenticated and have a row in public.users with role='admin' for admin actions to work.
-- If you prefer server-side trusted inserts, run inserts from server using the service_role key instead.
