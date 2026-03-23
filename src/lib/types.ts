export type UserRole = 'admin' | 'manager' | 'tl' | 'agent';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  campaign_id: string | null;
  status: UserStatus;
  is_online: boolean;
  theme_preference: ThemePreference;
  created_at: string;
  last_online_at?: string | null;
  last_offline_at?: string | null;
  updated_at?: string;
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
