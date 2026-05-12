-- Deletion Audit Logs Table
-- Tracks all deletions of messages, channels, and files

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

-- Policy: Only admins can view deletion logs
DROP POLICY IF EXISTS "deletion_logs_select_admin" ON public.deletion_audit_logs;
CREATE POLICY "deletion_logs_select_admin" ON public.deletion_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Policy: Authenticated users can insert
DROP POLICY IF EXISTS "deletion_logs_insert_authenticated" ON public.deletion_audit_logs;
CREATE POLICY "deletion_logs_insert_authenticated" ON public.deletion_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Policy: Service role can do anything
DROP POLICY IF EXISTS "deletion_logs_service_role" ON public.deletion_audit_logs;
CREATE POLICY "deletion_logs_service_role" ON public.deletion_audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.deletion_audit_logs TO authenticated;
GRANT INSERT ON public.deletion_audit_logs TO authenticated;
GRANT ALL ON public.deletion_audit_logs TO service_role;
