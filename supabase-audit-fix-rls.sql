-- Fix Audit Logging - Simplify RLS Policies for Proper Insert Access

-- Drop and recreate deletion_audit_logs with simpler RLS
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

-- Create indexes
CREATE INDEX idx_deletion_logs_user_id ON public.deletion_audit_logs(user_id);
CREATE INDEX idx_deletion_logs_entity_type ON public.deletion_audit_logs(entity_type);
CREATE INDEX idx_deletion_logs_created_at ON public.deletion_audit_logs(created_at DESC);

ALTER TABLE public.deletion_audit_logs ENABLE ROW LEVEL SECURITY;

-- Simple policies - allow all authenticated users to insert, only admins to read
CREATE POLICY "deletion_logs_insert" ON public.deletion_audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "deletion_logs_select" ON public.deletion_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

GRANT INSERT ON public.deletion_audit_logs TO authenticated;
GRANT SELECT ON public.deletion_audit_logs TO authenticated;
GRANT ALL ON public.deletion_audit_logs TO service_role;

-- Drop and recreate file_audit_logs with simpler RLS
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

-- Create indexes
CREATE INDEX idx_file_audit_user_id ON public.file_audit_logs(user_id);
CREATE INDEX idx_file_audit_action ON public.file_audit_logs(action);
CREATE INDEX idx_file_audit_channel_id ON public.file_audit_logs(channel_id);
CREATE INDEX idx_file_audit_created_at ON public.file_audit_logs(created_at DESC);

ALTER TABLE public.file_audit_logs ENABLE ROW LEVEL SECURITY;

-- Simple policies - allow all authenticated users to insert, only admins to read
CREATE POLICY "file_audit_insert" ON public.file_audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "file_audit_select" ON public.file_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

GRANT INSERT ON public.file_audit_logs TO authenticated;
GRANT SELECT ON public.file_audit_logs TO authenticated;
GRANT ALL ON public.file_audit_logs TO service_role;

-- Verify tables exist
SELECT 'Tables created successfully!' as status;
SELECT COUNT(*) as deletion_logs FROM public.deletion_audit_logs;
SELECT COUNT(*) as file_logs FROM public.file_audit_logs;
