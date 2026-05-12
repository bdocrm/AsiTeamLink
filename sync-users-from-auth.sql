-- Sync auth.users to public.users table
-- This should be run directly in Supabase SQL editor

-- Insert all auth users into public.users
INSERT INTO public.users (id, email, name, role, status)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  CASE 
    WHEN raw_user_meta_data->>'role' IN ('admin', 'compliance', 'manager', 'tl') THEN raw_user_meta_data->>'role'
    ELSE 'tl'
  END,
  'approved'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  status = 'approved';

SELECT 'Users synced: ' || COUNT(*) FROM public.users;
