-- Migration: Recreate auth triggers/functions for AsiTeamLink
-- Run this file in your new Supabase project's SQL editor to recreate the auth -> public.users handler.
-- NOTE: Ensure `public.users` table exists and RLS/policies allow inserts from this function.

BEGIN;

-- 1) Create or replace the handler function that inserts a row into public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'agent',
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Attach the trigger to auth.users (fired AFTER INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- Helpful checks / next steps (run manually in SQL editor):
-- 1) Verify the trigger exists:
--    SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema='auth' AND event_object_table='users';
-- 2) If Row Level Security (RLS) is enabled on public.users, ensure a policy allows inserts from this function or create a policy that permits the auth role you intend.
-- 3) If you prefer the function to run with elevated privileges, review SECURITY DEFINER ownership and the role that owns the function.
-- 4) Optionally run a test registration to confirm a row is created in public.users.
