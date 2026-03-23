'use client';

import { useState } from 'react';
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

    // Check user status
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
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 login-container">
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/asiteamlinklogo.png"
            alt="AsiTeamLink Logo"
            width={96}
            height={96}
            className="mb-4 rounded-2xl logo-animate w-20 h-20 sm:w-24 sm:h-24"
            priority
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">AsiTeamLink</h1>
          <p className="text-muted mt-1 text-sm sm:text-base">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger/10 text-danger text-sm border border-danger/20">
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
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
                className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>

          <p className="text-center mt-4 text-sm text-muted">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary hover:text-primary-hover font-medium transition-colors">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
