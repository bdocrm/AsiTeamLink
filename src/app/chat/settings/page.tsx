'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import MFASettings from '@/components/settings/MFASettings';
import SessionsManager from '@/components/settings/SessionsManager';
import type { ThemePreference } from '@/lib/types';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { preference, setPreference } = useTheme();
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    try {
      const res = await supabase.from('users').update({ name: name.trim() }).eq('id', user.id);
      if (res.error) console.error('Supabase update error (users.name):', res.error);
      else console.log('Supabase update success (users.name):', res.data);
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
                  disabled={!name.trim() || name === user?.name || saving}
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
    </div>
  );
}
