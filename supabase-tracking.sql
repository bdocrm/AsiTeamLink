-- ============================================
-- AsiTeamLink - User Status Tracking
-- Adds last_online_at and last_offline_at tracking
-- Run this in your Supabase SQL Editor
-- ============================================

-- Add tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_online_at timestamp WITH TIME ZONE DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_offline_at timestamp WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp WITH TIME ZONE DEFAULT now();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_last_online_at ON users(last_online_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_offline_at ON users(last_offline_at DESC);

-- Function to update user status tracking
CREATE OR REPLACE FUNCTION update_user_status_tracking()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  
  -- If user came online
  IF NEW.is_online = true AND OLD.is_online != true THEN
    NEW.last_online_at = now();
    NEW.last_offline_at = NULL;
  END IF;
  
  -- If user went offline
  IF NEW.is_online = false AND OLD.is_online != false THEN
    NEW.last_offline_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update status tracking
DROP TRIGGER IF EXISTS trg_update_user_status_tracking ON users;
CREATE TRIGGER trg_update_user_status_tracking
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_user_status_tracking();

-- Function to mark user as offline if they haven't been active for 30 minutes
CREATE OR REPLACE FUNCTION mark_inactive_users_offline()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET is_online = false, last_offline_at = now()
  WHERE is_online = true
  AND updated_at < now() - interval '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- Manually update existing online status for all users (one-time)
UPDATE users SET last_online_at = COALESCE(updated_at, now()) WHERE is_online = true;
UPDATE users SET last_offline_at = COALESCE(updated_at, now()) WHERE is_online = false;
