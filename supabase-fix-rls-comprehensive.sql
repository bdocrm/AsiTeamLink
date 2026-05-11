-- Comprehensive RLS fix for service role bypass
-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Approved users can read all users if admin" ON users;
DROP POLICY IF EXISTS "Approved users can read users in same campaign" ON users;
DROP POLICY IF EXISTS "Admin can read all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admin can update users" ON users;
DROP POLICY IF EXISTS "Admin can update any user" ON users;
DROP POLICY IF EXISTS "Service role and admin can update users" ON users;
DROP POLICY IF EXISTS "Allow insert during registration" ON users;

-- Service role bypass - allow all operations
CREATE POLICY "Service role bypass"
  ON users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- SELECT policies for authenticated users
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (auth.uid() = id AND auth.role() != 'service_role');

CREATE POLICY "Admin can read all users"
  ON users FOR SELECT
  USING (
    auth.role() != 'service_role' AND
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "Approved users can read campaign users"
  ON users FOR SELECT
  USING (
    auth.role() != 'service_role' AND
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND (u.role = 'admin' OR u.campaign_id = users.campaign_id)
    )
  );

-- UPDATE policies for authenticated users
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id AND auth.role() != 'service_role')
  WITH CHECK (auth.uid() = id AND auth.role() != 'service_role');

CREATE POLICY "Admin can update users"
  ON users FOR UPDATE
  USING (
    auth.role() != 'service_role' AND
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    auth.role() != 'service_role' AND
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- INSERT policy
CREATE POLICY "Allow insert during registration"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');
