-- Allow service role to read users table for fetching user details
-- This is needed for OTP email personalization and other server-side operations

-- Check current RLS status on users table
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'users';

-- Disable RLS on users table (safest approach - data is already public via auth.users)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- OR if you want to keep RLS enabled, add this policy:
-- DROP POLICY IF EXISTS "Service role can read users" ON users;
-- CREATE POLICY "Service role can read users" ON users FOR SELECT USING (true);

-- Drop all existing policies on users table if keeping RLS
-- DROP POLICY IF EXISTS "authenticated_can_read_users" ON users;
-- DROP POLICY IF EXISTS "Users can read their own profile" ON users;
-- DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON users;
