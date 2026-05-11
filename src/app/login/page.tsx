'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LogIn, Mail, Lock, Eye, EyeOff, Smartphone, Shield, RotateCcw } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [deviceInfo, setDeviceInfo] = useState<{ deviceName: string; ip: string } | null>(null);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const router = useRouter();

  // Check for recovery token in URL hash
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.substring(1));
    const type = params.get('type');

    if (type === 'recovery') {
      router.push('/reset-password');
    }
  }, [router]);

  // Handle resend cooldown
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpResendCooldown]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/adaptive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_device',
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      if (data.action === 'login_success') {
        // Device is trusted - redirect to chat
        router.push('/chat');
        router.refresh();
      } else if (data.action === 'needs_otp') {
        // New device - show OTP input
        setDeviceInfo(data.device_info);
        setStep('otp');
        setOtp('');
        setOtpResendCooldown(60);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/adaptive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          code: otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Verification failed');
        setLoading(false);
        return;
      }

      router.push('/chat');
      router.refresh();
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    // Resend is handled by re-submitting credentials
    handleCredentialsSubmit({ preventDefault: () => {} } as React.FormEvent);
    setOtpResendCooldown(60);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 login-container relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/3 blur-3xl" />
      </div>

      <div className="w-full max-w-md mx-auto relative z-10 animate-fade-in-up">
        <div className="flex flex-col items-center mb-8">
          <div className="loading-logo-ring mb-5">
            <Image
              src="/asiteamlinklogo.png"
              alt="AsiTeamLink Logo"
              width={96}
              height={96}
              className="rounded-2xl logo-animate w-20 h-20 sm:w-24 sm:h-24"
              priority
            />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold gradient-brand-text">AsiTeamLink</h1>
          <p className="text-muted mt-2 text-sm sm:text-base">
            {step === 'credentials' ? 'Sign in to your account' : 'Verify your device'}
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-6 sm:p-8 shadow-xl border border-border/50">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm border border-danger/20 animate-fade-in">
              {error}
            </div>
          )}

          {/* ========== CREDENTIALS FORM ========== */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="chat-input-field !pl-10"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="chat-input-field !pl-10 !pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 btn-primary font-semibold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="loading-spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </>
                )}
              </button>

              <p className="text-center mt-5 text-sm text-muted">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary hover:text-primary-hover font-semibold transition-colors">
                  Register
                </Link>
              </p>
            </form>
          )}

          {/* ========== OTP VERIFICATION FORM ========== */}
          {step === 'otp' && deviceInfo && (
            <form onSubmit={handleOtpSubmit}>
              <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">New Device Detected</p>
                    <p className="text-xs text-muted mt-1">
                      <strong>Device:</strong> {deviceInfo.deviceName}
                    </p>
                    <p className="text-xs text-muted">
                      <strong>IP:</strong> {deviceInfo.ip}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Verification Code
                  </div>
                </label>
                <p className="text-xs text-muted mb-2">Enter the 6-digit code sent to your email</p>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(val);
                  }}
                  maxLength={6}
                  placeholder="000000"
                  className="chat-input-field text-center text-lg letter-spacing-wide"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 btn-primary font-semibold text-[15px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="loading-spinner !w-5 !h-5 !border-2 !border-white/30 !border-t-white" />
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Verify Device
                  </>
                )}
              </button>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials');
                    setOtp('');
                    setError('');
                  }}
                  disabled={loading}
                  className="flex-1 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || otpResendCooldown > 0}
                  className="flex-1 py-2 text-sm font-medium text-primary hover:text-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  {otpResendCooldown > 0 ? `Resend (${otpResendCooldown}s)` : 'Resend'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
