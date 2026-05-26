export type UserRole = 'admin' | 'manager' | 'tl' | 'agent' | 'compliance';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
  name: string;
  position_prefix?: string | null;
  role: UserRole;
  campaign_id: string | null;
  status: UserStatus;
  is_online: boolean;
  theme_preference: ThemePreference;
  mfa_enabled: boolean;
  mfa_method: 'email' | 'totp';
  created_at: string;
  last_online_at?: string | null;
  last_offline_at?: string | null;
  updated_at?: string;
  aup_accepted_at?: string | null;
  full_name?: string | null;
}

export interface Campaign {
  id: string;
  name: string;
}

export interface Channel {
  id: string;
  name: string;
  campaign_id: string;
  created_by: string | null;
  created_at: string;
  posting_mode?: 'all' | 'leaders_only' | 'admin_only';
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  text: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  reply_to_id: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  sender?: User;
}

export interface Reaction {
  message_id: string;
  emoji: string;
  user_id: string;
  user_name: string;
}

export interface Announcement {
  id: string;
  campaign_id: string;
  channel_id?: string | null;
  audience_label?: string | null;
  title?: string | null;
  body: string;
  created_by: string;
  created_at: string;
  image_url?: string | null;
  created_by_name?: string | null;
  reactions?: AnnouncementReaction[];
  seen_count?: number;
  is_read?: boolean;
  seen_by_names?: string[];
}

export interface AnnouncementReaction {
  announcement_id: string;
  emoji: string;
  users: { id: string; name?: string | null }[];
}
