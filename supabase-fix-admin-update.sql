-- Fix RLS policy for admin user updates
-- Drop the incomplete policy and recreate it with WITH CHECK

DROP POLICY IF EXISTS "Admin can update any user" ON users;

CREATE POLICY "Admin can update any user"
  ON users FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
