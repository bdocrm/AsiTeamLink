-- Create password_reset_requests table
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  reason TEXT
);

-- Enable RLS
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can INSERT their own requests
CREATE POLICY "Users can request password reset" ON public.password_reset_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'compliance')));

-- RLS Policy: Only admin/compliance can SELECT all requests
CREATE POLICY "Admin and compliance can view reset requests" ON public.password_reset_requests
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'compliance')));

-- RLS Policy: Only admin can UPDATE requests
CREATE POLICY "Admin can update reset requests" ON public.password_reset_requests
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Create index for faster lookups
CREATE INDEX idx_password_reset_requests_user_id ON public.password_reset_requests(user_id);
CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests(status);
