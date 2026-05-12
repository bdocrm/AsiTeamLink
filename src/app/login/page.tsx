'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LogIn, Mail, Lock, Eye, EyeOff, Smartphone, Check, AlertCircle } from 'lucide-react';

type LoginStep = 'credentials' | 'otp';

interface DeviceInfo {
  device_name: string;
  ip_address: string;
  user_id?: string; // Store user_id from check_device
}

interface ForgotPasswordModal {
  isOpen: boolean;
  email: string;
  isLoading: boolean;
  message?: string;
  isSuccess?: boolean;
}

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [forgotPasswordModal, setForgotPasswordModal] = useState<ForgotPasswordModal>({
    isOpen: false,
    email: '',
    isLoading: false,
  });
  const router = useRouter();
  const supabase = createClient();

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Check for recovery token in URL hash
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.substring(1));
    const type = params.get('type');

    if (type === 'recovery') {
      router.push('/reset-password');
    }
  }, [router]);

  const handleCheckDevice = async (e: React.FormEvent) => {
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

      // Save device info for display
      if (data.device_info) {
        setDeviceInfo({
          ...data.device_info,
          user_id: data.user_id, // Store user_id from response
        });
      }

      if (data.result === 'login_success') {
        // Trusted device - log in directly
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          setLoading(false);
          return;
        }

        // Check account status
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: statusData } = await supabase.rpc('get_user_status', { user_id: user.id });
          const profile = statusData?.[0] ?? null;

          if (profile?.status === 'pending') {
            await supabase.auth.signOut();
            setError('Your account is pending approval. Please wait for admin approval.');
            setLoading(false);
            return;
          }

          if (profile?.status === 'rejected') {
            await supabase.auth.signOut();
            setError('Your account has been rejected. Please contact the administrator.');
            setLoading(false);
            return;
          }
        }

        router.push('/chat');
        router.refresh();
      } else if (data.result === 'needs_otp') {
        // New device - require OTP
        setStep('otp');
        setOtp('');
        setResendCooldown(60);
        setLoading(false);
      } else {
        setError('Unexpected response from server');
        setLoading(false);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/adaptive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          email,
          otp,
          user_id: deviceInfo?.user_id, // Pass user_id from deviceInfo
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'OTP verification failed');
        setLoading(false);
        return;
      }

      // Sign in with password after OTP verified
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // Check account status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: statusData } = await supabase.rpc('get_user_status', { user_id: user.id });
        const profile = statusData?.[0] ?? null;

        if (profile?.status === 'pending') {
          await supabase.auth.signOut();
          setError('Your account is pending approval. Please wait for admin approval.');
          setLoading(false);
          return;
        }

        if (profile?.status === 'rejected') {
          await supabase.auth.signOut();
          setError('Your account has been rejected. Please contact the administrator.');
          setLoading(false);
          return;
        }
      }

      router.push('/chat');
      router.refresh();
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setLoading(true);
    setResendCooldown(60);

    try {
      const response = await fetch('/api/auth/adaptive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_otp',
          email,
          user_id: deviceInfo?.user_id, // Pass user_id
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend OTP');
      } else {
        setError('');
        // Show success message briefly
      }
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordModal(prev => ({ ...prev, isLoading: true, message: undefined }));

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordModal.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotPasswordModal(prev => ({ 
          ...prev, 
          isLoading: false, 
          message: data.details || data.error || 'Failed to submit request',
          isSuccess: false,
        }));
        return;
      }

      // Success
      setForgotPasswordModal(prev => ({ 
        ...prev, 
        isLoading: false, 
        message: '✅ Password reset request submitted successfully!\n\nWait for the admin to process your request. You will receive notification.',
        isSuccess: true,
        email: '',
      }));

      // Auto-close after 3 seconds on success
      setTimeout(() => {
        setForgotPasswordModal(prev => ({ ...prev, isOpen: false, message: undefined }));
      }, 3000);

    } catch (err) {
      console.error('Forgot password error:', err);
      setForgotPasswordModal(prev => ({ 
        ...prev, 
        isLoading: false, 
        message: '❌ An error occurred. Please try again.',
        isSuccess: false,
      }));
    }
  };

  const openForgotPasswordModal = () => {
    setForgotPasswordModal({ isOpen: true, email, isLoading: false });
  };

  const closeForgotPasswordModal = () => {
    setForgotPasswordModal({ isOpen: false, email: '', isLoading: false, message: undefined });
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
            {step === 'credentials' ? 'Sign in to your account' : 'Verify your identity'}
          </p>
        </div>

        <form onSubmit={step === 'credentials' ? handleCheckDevice : handleVerifyOtp} className="glass-strong rounded-2xl p-6 sm:p-8 shadow-xl border border-border/50">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm border border-danger/20 animate-fade-in flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'credentials' ? (
            <>
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

              <button
                type="button"
                onClick={openForgotPasswordModal}
                disabled={loading}
                className="w-full mt-3 py-2 text-sm font-medium text-primary hover:text-primary-hover disabled:text-muted transition-colors"
              >
                Forgot Password?
              </button>
            </>
          ) : (
            <>
              {deviceInfo && (
                <div className="mb-6 p-4 rounded-xl bg-secondary/10 border border-secondary/20">
                  <div className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">New Device Detected</p>
                      <p className="text-xs text-muted mt-1">{deviceInfo.device_name}</p>
                      <p className="text-xs text-muted">{deviceInfo.ip_address}</p>
                      <p className="text-xs text-muted mt-2">A 6-digit code has been sent to your email.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground mb-1.5">Verification Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  placeholder="000000"
                  className="chat-input-field text-center text-2xl tracking-widest font-mono"
                  disabled={loading}
                  autoFocus
                />
                <p className="text-xs text-muted mt-2">Enter the 6-digit code from your email</p>
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
                    <Check className="w-4 h-4" />
                    Verify Code
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
                className="w-full mt-3 py-2 text-sm font-medium text-primary hover:text-primary-hover disabled:text-muted transition-colors"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setOtp('');
                  setError('');
                  setResendCooldown(0);
                }}
                disabled={loading}
                className="w-full mt-2 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                Back to Login
              </button>
            </>
          )}

          {step === 'credentials' && (
            <p className="text-center mt-5 text-sm text-muted">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-primary hover:text-primary-hover font-semibold transition-colors">
                Register
              </Link>
            </p>
          )}
        </form>

        {/* Forgot Password Modal */}
        {forgotPasswordModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface border border-border rounded-xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="border-b border-border px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Password Reset Request</h2>
              </div>

              {/* Content */}
              <div className="px-6 py-6">
                {!forgotPasswordModal.message ? (
                  <form onSubmit={handleForgotPasswordSubmit}>
                    <p className="text-sm text-muted mb-4">
                      Enter the email address associated with your account. An admin will process your password reset request.
                    </p>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-foreground mb-2">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                          type="email"
                          value={forgotPasswordModal.email}
                          onChange={(e) => setForgotPasswordModal(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="you@example.com"
                          className="chat-input-field !pl-10"
                          required
                          disabled={forgotPasswordModal.isLoading}
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeForgotPasswordModal}
                        disabled={forgotPasswordModal.isLoading}
                        className="flex-1 px-4 py-2 text-foreground bg-surface border border-border rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={forgotPasswordModal.isLoading || !forgotPasswordModal.email.trim()}
                        className="flex-1 px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {forgotPasswordModal.isLoading && (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {forgotPasswordModal.isLoading ? 'Submitting...' : 'Request Reset'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="text-center">
                    <div className={`text-4xl mb-4 ${forgotPasswordModal.isSuccess ? 'text-success' : 'text-danger'}`}>
                      {forgotPasswordModal.isSuccess ? '✅' : '❌'}
                    </div>
                    <p className="text-base font-medium text-foreground whitespace-pre-line">
                      {forgotPasswordModal.message}
                    </p>
                    {!forgotPasswordModal.isSuccess && (
                      <button
                        onClick={closeForgotPasswordModal}
                        className="mt-4 px-4 py-2 text-white bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-colors w-full"
                      >
                        Close
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
