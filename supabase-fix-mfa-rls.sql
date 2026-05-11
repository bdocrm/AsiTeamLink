-- Fix RLS permissions for mfa_codes table
-- The service role needs permission to read/write mfa_codes for OTP verification

-- 1. Disable RLS on mfa_codes table (service role can access it without row-level checks)
ALTER TABLE mfa_codes DISABLE ROW LEVEL SECURITY;

-- Alternative (if you want to keep RLS but allow service role):
-- ALTER TABLE mfa_codes ENABLE ROW LEVEL SECURITY;
-- 
-- DROP POLICY IF EXISTS "Service role can manage MFA codes" ON mfa_codes;
-- CREATE POLICY "Service role can manage MFA codes"
--   ON mfa_codes
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);
