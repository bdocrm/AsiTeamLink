'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Check for recovery token in URL hash
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.substring(1)); // Remove # and parse
    const type = params.get('type');
    const accessToken = params.get('access_token');

    if (type === 'recovery' && accessToken) {
      console.log('Recovery token detected, redirecting to password reset');
      router.push('/reset-password');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

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

      // Check if MFA is enabled
      if (profile?.mfa_enabled) {
        // Redirect to MFA verification page
        router.push('/auth/mfa-verify');
        return;
      }
    }

    router.push('/chat');
    router.refresh();
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
          <p className="text-muted mt-2 text-sm sm:text-base">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="glass-strong rounded-2xl p-6 sm:p-8 shadow-xl border border-border/50">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 text-danger text-sm border border-danger/20 animate-fade-in">
              {error}
            </div>
          )}

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
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
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
      </div>
    </div>
  );
}
