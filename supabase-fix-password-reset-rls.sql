-- Fix password reset RLS policies to work with admin client

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can request password reset" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Admin and compliance can view reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Admin can update reset requests" ON public.password_reset_requests;

-- Ensure table has RLS enabled
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Grant minimum required permissions
GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO authenticated;
GRANT ALL PRIVILEGES ON public.password_reset_requests TO service_role;

-- RLS Policy: Authenticated users can INSERT (any authenticated user can create a request for themselves or as admin)
CREATE POLICY "password_reset_insert" ON public.password_reset_requests
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policy: Authenticated users can SELECT
CREATE POLICY "password_reset_select" ON public.password_reset_requests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policy: Authenticated users can UPDATE
CREATE POLICY "password_reset_update" ON public.password_reset_requests
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);
