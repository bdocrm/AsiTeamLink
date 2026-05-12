-- Comprehensive password reset system setup
-- This migration creates the table if it doesn't exist and sets up RLS policies

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  reason TEXT
);

-- Drop existing RLS policies to recreate them
DROP POLICY IF EXISTS "Users can request password reset" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Admin and compliance can view reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Admin can update reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "password_reset_insert" ON public.password_reset_requests;
DROP POLICY IF EXISTS "password_reset_select" ON public.password_reset_requests;
DROP POLICY IF EXISTS "password_reset_update" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Allow user password reset requests" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Allow password reset request view" ON public.password_reset_requests;
DROP POLICY IF EXISTS "Allow password reset request update" ON public.password_reset_requests;

-- Enable RLS
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL PRIVILEGES ON public.password_reset_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO authenticated;

-- RLS Policy: Allow INSERT for any authenticated user
CREATE POLICY "password_reset_insert_policy" ON public.password_reset_requests
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policy: Allow SELECT for any authenticated user
CREATE POLICY "password_reset_select_policy" ON public.password_reset_requests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policy: Allow UPDATE for any authenticated user
CREATE POLICY "password_reset_update_policy" ON public.password_reset_requests
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON public.password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON public.password_reset_requests(status);
