'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function MFAVerifyPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check if user has a session but not verified MFA yet
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      }
    };
    checkSession();
  }, [router, supabase]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (code.length !== 6 || isNaN(Number(code))) {
      setError('Please enter a valid 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Verification failed');
        setLoading(false);
        return;
      }

      // MFA verified, redirect to chat
      router.push('/chat');
    } catch (err: any) {
      setError(err?.message || 'Verification error');
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResendCooldown(60);

    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Failed to resend code');
        setResendCooldown(0);
        return;
      }

      // Start countdown
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Resend error');
      setResendCooldown(0);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-5">
            <Image
              src="/asiteamlinklogo.png"
              alt="AsiTeamLink Logo"
              width={96}
              height={96}
              className="rounded-2xl w-20 h-20"
              priority
            />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Verify Code</h1>
          <p className="text-muted mt-2 text-sm">Enter the code sent to your email</p>
        </div>

        <form onSubmit={handleVerify} className="bg-card rounded-2xl p-8 shadow-xl border border-border/50">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm border border-danger/20">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-foreground mb-2">
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-input rounded-lg bg-background text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              disabled={loading}
            />
            <p className="text-xs text-muted mt-2">6-digit code from your email</p>
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="w-full text-primary text-sm py-2 hover:underline disabled:text-muted disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
          </button>
        </form>

        <p className="text-sm text-muted text-center mt-6">
          Didn't receive the code? Check your spam folder or{' '}
          <button
            onClick={() => router.push('/login')}
            className="text-primary hover:underline"
          >
            try another method
          </button>
        </p>
      </div>
    </div>
  );
}
