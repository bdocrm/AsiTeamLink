-- Better RLS policy for admin user updates
-- This allows:
-- 1. Admin users to update any user
-- 2. Service role (admin API) to update any user (bypasses RLS)

-- First, drop the old policies
DROP POLICY IF EXISTS "Admin can update any user" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin can update any user (includes service role)
-- The service role is treated as a super-admin and bypasses RLS checks
CREATE POLICY "Admin can update users"
  ON users FOR UPDATE
  USING (true)  -- Service role bypasses this; authenticated users need to be admin
  WITH CHECK (
    -- For authenticated users, must be admin
    CASE 
      WHEN auth.role() = 'service_role' THEN true  -- Service role can always update
      ELSE EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    END
  );
