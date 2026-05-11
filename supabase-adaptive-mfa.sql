-- Adaptive MFA: Smart device trust + comprehensive login audit
-- Skip OTP for trusted devices (same IP + device hash), require for new devices/IPs
-- Comprehensive login audit trail for compliance

-- Login sessions table - tracks active trusted sessions
CREATE TABLE IF NOT EXISTS login_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address varchar(45),
  device_name varchar(255),
  user_agent text,
  device_hash varchar(255), -- SHA256 hash of IP + device for matching
  is_active boolean DEFAULT true,
  login_at timestamp WITH TIME ZONE DEFAULT now(),
  last_activity_at timestamp WITH TIME ZONE DEFAULT now(),
  logout_at timestamp WITH TIME ZONE,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  updated_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Login audit table - all login attempts for compliance
CREATE TABLE IF NOT EXISTS login_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address varchar(45),
  device_name varchar(255),
  user_agent text,
  attempt_type varchar(20), -- 'password', 'otp', 'session_check'
  success boolean,
  reason varchar(255), -- 'trusted_device', 'new_device', 'new_ip', 'invalid_password', 'invalid_otp', etc
  created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- MFA codes table - OTP codes for device verification
CREATE TABLE IF NOT EXISTS mfa_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code varchar(6) NOT NULL,
  expires_at timestamp WITH TIME ZONE NOT NULL,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  used_at timestamp WITH TIME ZONE,
  CONSTRAINT code_format CHECK (code ~ '^\d{6}$')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_device_hash ON login_sessions(device_hash);
CREATE INDEX IF NOT EXISTS idx_login_sessions_is_active ON login_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_login_sessions_last_activity ON login_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_login_audit_user_id ON login_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_login_audit_created_at ON login_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_mfa_codes_user_id ON mfa_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_codes_expires_at ON mfa_codes(expires_at);

-- Enable RLS
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for login_sessions
DROP POLICY IF EXISTS "Users can read own sessions" ON login_sessions;
DROP POLICY IF EXISTS "Users can revoke own sessions" ON login_sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON login_sessions;

CREATE POLICY "Users can read own sessions"
  ON login_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can revoke own sessions"
  ON login_sessions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage all sessions"
  ON login_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for login_audit
DROP POLICY IF EXISTS "Users can read own login audit" ON login_audit;
DROP POLICY IF EXISTS "Compliance can read all audit logs" ON login_audit;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON login_audit;

CREATE POLICY "Users can read own login audit"
  ON login_audit FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Compliance can read all audit logs"
  ON login_audit FOR SELECT
  USING ((SELECT role FROM users WHERE id = auth.uid()) IN ('compliance', 'admin'));

CREATE POLICY "Service role can insert audit logs"
  ON login_audit FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- RLS Policies for mfa_codes
DROP POLICY IF EXISTS "Users can read own MFA codes" ON mfa_codes;
DROP POLICY IF EXISTS "Users can insert own MFA codes" ON mfa_codes;
DROP POLICY IF EXISTS "Users can update own MFA codes" ON mfa_codes;
DROP POLICY IF EXISTS "Service role can manage all MFA codes" ON mfa_codes;

CREATE POLICY "Users can read own MFA codes"
  ON mfa_codes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own MFA codes"
  ON mfa_codes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own MFA codes"
  ON mfa_codes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage all MFA codes"
  ON mfa_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

