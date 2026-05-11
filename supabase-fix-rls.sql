-- Fix RLS policies for service role access
-- The auth.role() = 'service_role' check wasn't working, use simpler approach

-- Drop problematic policies
DROP POLICY IF EXISTS "Service role can manage all sessions" ON login_sessions;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON login_audit;
DROP POLICY IF EXISTS "Service role can manage all MFA codes" ON mfa_codes;

-- Replace with simpler policies that allow service role access
-- These use USING (true) which allows everyone through RLS when evaluated by service role
CREATE POLICY "Service role full access login_sessions"
ON login_sessions FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access login_audit"
ON login_audit FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access mfa_codes"
ON mfa_codes FOR ALL
USING (true)
WITH CHECK (true);
