-- Fix RLS SELECT policies to allow both admin AND compliance roles

-- Deletion audit logs
DROP POLICY IF EXISTS "deletion_logs_select" ON public.deletion_audit_logs;
CREATE POLICY "deletion_logs_select" ON public.deletion_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'compliance')
    )
  );

-- File audit logs
DROP POLICY IF EXISTS "file_audit_select" ON public.file_audit_logs;
CREATE POLICY "file_audit_select" ON public.file_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'compliance')
    )
  );

SELECT 'RLS policies updated for admin + compliance access' AS status;
