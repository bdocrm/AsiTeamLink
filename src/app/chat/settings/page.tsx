'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Sun,
  Moon,
  Monitor,
  Save,
  CheckCircle,
  Palette,
  Smartphone,
  Bell,
  FileCheck,
} from 'lucide-react';
import MFASettings from '@/components/settings/MFASettings';
import SessionsManager from '@/components/settings/SessionsManager';
import AUPModal from '@/components/AUPModal';
import type { ThemePreference } from '@/lib/types';
import type { Channel } from '@/lib/types';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notificationPreferences';

const POSITION_PREFIX_OPTIONS = [
  'TRAINER',
  'PAYROLL STAFF',
  'STATUTORY STAFF',
  'DTR STAFF',
  'FINANCE STAFF',
  'PURCHASING STAFF',
  'TA ADMIN',
  'TA SPECIALIST',
  'HR GENERALIST',
  'CLINIC ASSISTANT',
  'HR ADMIN',
  'PREMISES ADMIN',
  'OFFICER IN CHARGE',
  'APS',
  'COMPLIANCE STAFF',
  'OIC - COMPLIANCE',
  'IT STAFF',
  'SMT ASSISTANT',
  'SENIOR WEB DEVELOPER',
  'WEB DEVELOPER',
  'AI RESEARCHER',
  'GRAPHIC ARTIST',
  'OIC - APS',
  'OIC - BDO QA',
  'OIC - BPI QA',
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { preference, setPreference } = useTheme();
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(user?.name || '');
  const [positionPrefix, setPositionPrefix] = useState(user?.position_prefix || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() => getNotificationPreferences());
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  const [showAupModal, setShowAupModal] = useState(false);
  const currentPositionPrefix = positionPrefix.trim();
  const hasCustomPositionPrefix =
    currentPositionPrefix !== '' && !POSITION_PREFIX_OPTIONS.includes(currentPositionPrefix);

  const handleSaveName = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    try {
      const res = await supabase
        .from('users')
        .update({ name: name.trim(), position_prefix: positionPrefix.trim() || null })
        .eq('id', user.id);
      if (res.error) console.error('Supabase update error (users.name/position_prefix):', res.error);
      else console.log('Supabase update success (users.name/position_prefix):', res.data);
    } catch (err) {
      console.error('Unhandled error updating users.name:', err);
    }
    await refreshUser();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleThemeChange = async (pref: ThemePreference) => {
    setPreference(pref);
    if (user) {
      try {
        const res = await supabase.from('users').update({ theme_preference: pref }).eq('id', user.id);
        if (res.error) console.error('Supabase update error (users.theme_preference):', res.error);
        else console.log('Supabase update success (users.theme_preference):', res.data);
      } catch (err) {
        console.error('Unhandled error updating users.theme_preference:', err);
      }
    }
  };

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, desc: 'Clean, bright interface' },
    { value: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, desc: 'Easy on the eyes' },
    { value: 'system', label: 'System', icon: <Monitor className="w-5 h-5" />, desc: 'Match your OS setting' },
  ];

  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase.rpc('get_my_channels');
      setMyChannels((data || []) as Channel[]);
    };
    loadChannels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveNotifications = () => {
    saveNotificationPreferences(notificationPrefs);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 1500);
  };

  const toggleChannelMute = (channelId: string) => {
    setNotificationPrefs(prev => {
      const exists = prev.mutedChannelIds.includes(channelId);
      return {
        ...prev,
        mutedChannelIds: exists
          ? prev.mutedChannelIds.filter(id => id !== channelId)
          : [...prev.mutedChannelIds, channelId],
      };
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/chat')}
            className="p-2 text-muted hover:text-foreground hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Settings</h1>
            <p className="text-xs text-muted">Customize your profile and preferences</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* Profile section */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Profile</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Display Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
                <button
                  onClick={handleSaveName}
                  disabled={
                    !name.trim() ||
                    (name === user?.name && (positionPrefix || '') === (user?.position_prefix || '')) ||
                    saving
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saved ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <p className="text-sm text-muted">{user?.email}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Role</label>
              <p className="text-sm text-muted capitalize">
                {user?.role === 'tl' ? 'Team Leader' : user?.role}
              </p>
            </div>
          </div>
        </div>

        {/* Theme section */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Appearance</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => handleThemeChange(option.value)}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  preference === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-surface-hover'
                }`}
              >
                <div className={`mx-auto mb-2 ${preference === option.value ? 'text-primary' : 'text-muted'}`}>
                  {option.icon}
                </div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="text-xs text-muted mt-0.5">{option.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Security section - MFA */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Notification Preferences</h2>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Message notifications</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setNotificationPrefs(prev => ({ ...prev, mode: 'mentions' }))}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${notificationPrefs.mode === 'mentions' ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted hover:text-foreground'}`}
                >
                  Mentions only
                </button>
                <button
                  onClick={() => setNotificationPrefs(prev => ({ ...prev, mode: 'all' }))}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${notificationPrefs.mode === 'all' ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted hover:text-foreground'}`}
                >
                  All messages
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Position Prefix (Badge)</label>
              <select
                value={positionPrefix}
                onChange={(e) => setPositionPrefix(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">No badge</option>
                {hasCustomPositionPrefix && (
                  <option value={positionPrefix}>{positionPrefix}</option>
                )}
                {POSITION_PREFIX_OPTIONS.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">This badge appears to members in the user list.</p>
              <div className="mt-3">
                <button
                  onClick={handleSaveName}
                  disabled={
                    !name.trim() ||
                    (name === user?.name && (positionPrefix || '') === (user?.position_prefix || '')) ||
                    saving
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saved ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">Desktop sound</span>
              <input
                type="checkbox"
                checked={notificationPrefs.desktopSound}
                onChange={(e) => setNotificationPrefs(prev => ({ ...prev, desktopSound: e.target.checked }))}
                className="w-4 h-4"
              />
            </label>

            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">Quiet hours</span>
                <input
                  type="checkbox"
                  checked={notificationPrefs.quietHoursEnabled}
                  onChange={(e) => setNotificationPrefs(prev => ({ ...prev, quietHoursEnabled: e.target.checked }))}
                  className="w-4 h-4"
                />
              </label>
              {notificationPrefs.quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">Start</label>
                    <input
                      type="time"
                      value={notificationPrefs.quietStart}
                      onChange={(e) => setNotificationPrefs(prev => ({ ...prev, quietStart: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">End</label>
                    <input
                      type="time"
                      value={notificationPrefs.quietEnd}
                      onChange={(e) => setNotificationPrefs(prev => ({ ...prev, quietEnd: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">Mute specific channels</p>
              <div className="max-h-44 overflow-auto border border-border rounded-lg p-2 space-y-1">
                {myChannels.length === 0 && (
                  <p className="text-xs text-muted px-1 py-1">No channels available</p>
                )}
                {myChannels.map((ch) => (
                  <label key={ch.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-surface-hover">
                    <span className="text-sm text-foreground truncate">{ch.name}</span>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.mutedChannelIds.includes(ch.id)}
                      onChange={() => toggleChannelMute(ch.id)}
                      className="w-4 h-4"
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveNotifications}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              {notifSaved ? 'Saved' : 'Save Notification Preferences'}
            </button>
          </div>
        </div>

        {/* Security section - MFA */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileCheck className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">AUP Agreement</h2>
          </div>
          {user?.aup_accepted_at ? (
            <div>
              <p className="text-sm text-foreground">Accepted</p>
              <p className="text-xs text-muted mt-1">
                {new Date(user.aup_accepted_at).toLocaleString()}
              </p>
              <button
                onClick={() => setShowAupModal(true)}
                className="mt-3 px-2.5 py-1 text-xs border border-border rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                View AUP
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-warning">Not yet accepted</p>
              <button
                onClick={() => setShowAupModal(true)}
                className="mt-3 px-2.5 py-1 text-xs border border-border rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                View AUP
              </button>
            </div>
          )}
        </div>

        {/* Security section - MFA */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <MFASettings mfaEnabled={user?.mfa_enabled || false} onStatusChange={refreshUser} />
        </div>

        {/* Security section - Active Sessions */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Smartphone className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Active Sessions</h2>
          </div>
          <p className="text-sm text-muted mb-4">
            Manage your login sessions across different devices. You can revoke access from any device at any time.
          </p>
          <SessionsManager />
        </div>
      </div>
      {showAupModal && (
        <AUPModal
          userName={user?.name || 'User'}
          readOnly
          onClose={() => setShowAupModal(false)}
        />
      )}
    </div>
  );
}
