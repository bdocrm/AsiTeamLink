'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Shield, Loader } from 'lucide-react';

interface MFASettingsProps {
  mfaEnabled: boolean;
  onStatusChange?: () => void;
}

export default function MFASettings({ mfaEnabled, onStatusChange }: MFASettingsProps) {
  const [isEnabled, setIsEnabled] = useState(mfaEnabled);
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleToggleMFA = async () => {
    setMessage('');
    setError('');
    setLoading(true);

    try {
      if (isEnabled) {
        // Disable MFA
        const res = await fetch('/api/auth/mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'disable' }),
        });

        const result = await res.json();

        if (!res.ok) {
          setError(result.error || 'Failed to disable MFA');
          setLoading(false);
          return;
        }

        setIsEnabled(false);
        setMessage('Two-factor authentication disabled');
        onStatusChange?.();
      } else {
        // Enable MFA - send verification code
        const res = await fetch('/api/auth/mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'enable' }),
        });

        const result = await res.json();

        if (!res.ok) {
          setError(result.error || 'Failed to enable MFA');
          setLoading(false);
          return;
        }

        setShowVerification(true);
        setMessage('Verification code sent to your email');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating MFA settings');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setMessage('');
    setError('');
    setLoading(true);

    if (verificationCode.length !== 6 || isNaN(Number(verificationCode))) {
      setError('Please enter a valid 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code: verificationCode }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Invalid verification code');
        setLoading(false);
        return;
      }

      setIsEnabled(true);
      setShowVerification(false);
      setVerificationCode('');
      setMessage('Two-factor authentication enabled successfully');
      onStatusChange?.();
    } catch (err: any) {
      setError(err?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between p-4 bg-surface rounded-lg border border-border">
        <div className="flex items-start gap-3 flex-1">
          <Shield className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-foreground">Two-Factor Authentication</h3>
            <p className="text-sm text-muted mt-1">
              {isEnabled
                ? 'Enabled - You will be asked for a verification code on login'
                : 'Not enabled - Add an extra layer of security to your account'}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled || showVerification}
            onChange={handleToggleMFA}
            disabled={loading || showVerification}
            className="w-4 h-4 rounded border-input"
          />
          {loading && <Loader className="w-4 h-4 animate-spin" />}
        </label>
      </div>

      {message && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {showVerification && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <p className="text-sm text-blue-900">
            We sent a 6-digit verification code to your email. Enter it below to enable two-factor authentication.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="flex-1 px-3 py-2 text-center text-xl tracking-widest border border-input rounded-lg bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
            <button
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              onClick={() => {
                setShowVerification(false);
                setVerificationCode('');
                setError('');
              }}
              disabled={loading}
              className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg hover:bg-surface-hover disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
