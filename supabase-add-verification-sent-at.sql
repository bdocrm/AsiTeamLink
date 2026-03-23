-- Add verification_sent_at column to users for email rate limiting
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamp with time zone DEFAULT NULL;

-- Optional: index for queries by recent sends
CREATE INDEX IF NOT EXISTS idx_users_verification_sent_at ON public.users(verification_sent_at);
