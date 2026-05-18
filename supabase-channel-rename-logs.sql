-- Create table for channel rename audit logs
CREATE TABLE IF NOT EXISTS channel_rename_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  old_name text,
  new_name text NOT NULL,
  user_id uuid NOT NULL,
  ip_address text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_rename_logs_channel_id ON channel_rename_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_rename_logs_user_id ON channel_rename_logs(user_id);
