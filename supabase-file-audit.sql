-- File Audit Logs Table
-- Tracks all file uploads, downloads, and views

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

-- Policy: Only admins can view file audit logs
DROP POLICY IF EXISTS "file_audit_logs_select_admin" ON public.file_audit_logs;
CREATE POLICY "file_audit_logs_select_admin" ON public.file_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Policy: Authenticated users can insert
DROP POLICY IF EXISTS "file_audit_logs_insert_authenticated" ON public.file_audit_logs;
CREATE POLICY "file_audit_logs_insert_authenticated" ON public.file_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Policy: Service role can do anything
DROP POLICY IF EXISTS "file_audit_logs_service_role" ON public.file_audit_logs;
CREATE POLICY "file_audit_logs_service_role" ON public.file_audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.file_audit_logs TO authenticated;
GRANT INSERT ON public.file_audit_logs TO authenticated;
GRANT ALL ON public.file_audit_logs TO service_role;
