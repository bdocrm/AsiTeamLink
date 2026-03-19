-- ============================================
-- AsiTeamLink - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Campaigns table
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(50) NOT NULL UNIQUE
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email varchar(150) UNIQUE NOT NULL,
  name varchar(100) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'tl', 'agent')),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_online boolean DEFAULT false,
  theme_preference varchar(10) DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
  created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Channels table
CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(100) NOT NULL,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Messages table
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text varchar(1000),
  attachment_url varchar(500),
  attachment_name varchar(150),
  attachment_size integer,
  created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_campaign_id ON users(campaign_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_channels_campaign_id ON channels(campaign_id);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Approved users can read all users if admin"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY "Approved users can read users in same campaign"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND (u.role = 'admin' OR u.campaign_id = users.campaign_id)
    )
  );

CREATE POLICY "Admin can read all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can update any user"
  ON users FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "Allow insert during registration"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Campaigns policies
CREATE POLICY "Approved users can read campaigns"
  ON campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
    )
  );

CREATE POLICY "Admin can manage campaigns"
  ON campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Channels policies
CREATE POLICY "Users can read channels in their campaign"
  ON channels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND (u.role = 'admin' OR u.campaign_id = channels.campaign_id)
    )
  );

CREATE POLICY "Admin, Manager, TL can create channels"
  ON channels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.status = 'approved'
      AND u.role IN ('admin', 'manager', 'tl')
    )
  );

CREATE POLICY "Admin can delete channels"
  ON channels FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Messages policies
CREATE POLICY "Users can read messages in their campaign channels"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN users u ON u.id = auth.uid()
      WHERE c.id = messages.channel_id
      AND u.status = 'approved'
      AND (u.role = 'admin' OR u.campaign_id = c.campaign_id)
    )
  );

CREATE POLICY "Approved users can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM channels c
      JOIN users u ON u.id = auth.uid()
      WHERE c.id = channel_id
      AND u.status = 'approved'
      AND (u.role = 'admin' OR u.campaign_id = c.campaign_id)
    )
  );

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- STORAGE
-- ============================================

-- Create storage bucket for attachments (run in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- Storage policies
-- CREATE POLICY "Authenticated users can upload"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');

-- CREATE POLICY "Anyone can read attachments"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'attachments');

-- ============================================
-- FUNCTION: Handle new user registration
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'agent',
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
