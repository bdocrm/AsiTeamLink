-- Fix user roles after sync
-- This bypasses RLS by using SECURITY DEFINER or direct SQL

-- First, check what role the current user has
SELECT id, email, role FROM public.users WHERE email = 'mackejercito01@gmail.com';

-- Update to admin role (this might still fail due to RLS, but let's try)
UPDATE public.users
SET role = 'admin'
WHERE email = 'mackejercito01@gmail.com';

-- Verify the update
SELECT id, email, role FROM public.users WHERE email = 'mackejercito01@gmail.com';

SELECT 'Role update attempted' AS status;
