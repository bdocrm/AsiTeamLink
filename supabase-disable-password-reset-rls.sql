-- Temporarily disable RLS to allow INSERT/SELECT/UPDATE to work
ALTER TABLE public.password_reset_requests DISABLE ROW LEVEL SECURITY;

-- Grant full permissions to all roles
GRANT ALL PRIVILEGES ON public.password_reset_requests TO public;
GRANT ALL PRIVILEGES ON public.password_reset_requests TO authenticated;
GRANT ALL PRIVILEGES ON public.password_reset_requests TO service_role;
