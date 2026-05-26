-- Add moderation timeout fields to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS muted_until timestamptz NULL,
ADD COLUMN IF NOT EXISTS muted_reason text NULL;

-- Optional index for moderation queries
CREATE INDEX IF NOT EXISTS idx_users_muted_until ON public.users(muted_until);

