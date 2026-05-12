-- Verification and Setup Script for Audit Logging Tables
-- This script checks if tables exist and creates them if needed

-- Check deletion_audit_logs table
SELECT 
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'deletion_audit_logs'
  ) as deletion_table_exists;

-- Check file_audit_logs table
SELECT 
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'file_audit_logs'
  ) as file_table_exists;

-- If deletion_audit_logs doesn't exist, create it
DROP TABLE IF EXISTS public.deletion_audit_logs CASCADE;

CREATE TABLE public.deletion_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('message', 'channel', 'file')),
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  reason TEXT,
  permanent BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_deletion_logs_user_id ON public.deletion_audit_logs(user_id);
CREATE INDEX idx_deletion_logs_entity_type ON public.deletion_audit_logs(entity_type);
CREATE INDEX idx_deletion_logs_created_at ON public.deletion_audit_logs(created_at DESC);
CREATE INDEX idx_deletion_logs_deleted_at ON public.deletion_audit_logs(deleted_at DESC);

-- Enable Row Level Security
ALTER TABLE public.deletion_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "deletion_logs_select_admin" ON public.deletion_audit_logs;
DROP POLICY IF EXISTS "deletion_logs_insert_authenticated" ON public.deletion_audit_logs;
DROP POLICY IF EXISTS "deletion_logs_service_role" ON public.deletion_audit_logs;

-- Create new policies
CREATE POLICY "deletion_logs_select_admin" ON public.deletion_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "deletion_logs_insert_authenticated" ON public.deletion_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "deletion_logs_service_role" ON public.deletion_audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.deletion_audit_logs TO authenticated;
GRANT INSERT ON public.deletion_audit_logs TO authenticated;
GRANT ALL ON public.deletion_audit_logs TO service_role;

-- If file_audit_logs doesn't exist, create it
DROP TABLE IF EXISTS public.file_audit_logs CASCADE;

CREATE TABLE public.file_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_id UUID,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  file_type TEXT,
  action TEXT NOT NULL CHECK (action IN ('upload', 'download', 'view', 'delete')),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ip_address INET,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_file_audit_user_id ON public.file_audit_logs(user_id);
CREATE INDEX idx_file_audit_action ON public.file_audit_logs(action);
CREATE INDEX idx_file_audit_channel_id ON public.file_audit_logs(channel_id);
CREATE INDEX idx_file_audit_created_at ON public.file_audit_logs(created_at DESC);
CREATE INDEX idx_file_audit_status ON public.file_audit_logs(status);

-- Enable Row Level Security
ALTER TABLE public.file_audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "file_audit_logs_select_admin" ON public.file_audit_logs;
DROP POLICY IF EXISTS "file_audit_logs_insert_authenticated" ON public.file_audit_logs;
DROP POLICY IF EXISTS "file_audit_logs_service_role" ON public.file_audit_logs;

-- Create new policies
CREATE POLICY "file_audit_logs_select_admin" ON public.file_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

CREATE POLICY "file_audit_logs_insert_authenticated" ON public.file_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "file_audit_logs_service_role" ON public.file_audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.file_audit_logs TO authenticated;
GRANT INSERT ON public.file_audit_logs TO authenticated;
GRANT ALL ON public.file_audit_logs TO service_role;

-- Verify tables were created
SELECT 'deletion_audit_logs' as table_name, COUNT(*) as row_count FROM public.deletion_audit_logs
UNION ALL
SELECT 'file_audit_logs' as table_name, COUNT(*) as row_count FROM public.file_audit_logs;
