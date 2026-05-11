-- Add MFA support to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method varchar(20) DEFAULT 'email' CHECK (mfa_method IN ('email', 'totp'));

-- Create MFA codes table for OTP storage
CREATE TABLE IF NOT EXISTS mfa_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code varchar(6) NOT NULL,
  expires_at timestamp WITH TIME ZONE NOT NULL,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  used_at timestamp WITH TIME ZONE,
  CONSTRAINT code_format CHECK (code ~ '^\d{6}$')
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_mfa_codes_user_id ON mfa_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_codes_expires_at ON mfa_codes(expires_at);

-- Enable RLS on MFA codes
ALTER TABLE mfa_codes ENABLE ROW LEVEL SECURITY;

-- MFA policies - users can only see their own codes
CREATE POLICY "Users can read own MFA codes"
  ON mfa_codes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage MFA codes"
  ON mfa_codes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
