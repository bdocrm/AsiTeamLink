'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get hash from URL - Supabase puts tokens here
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        console.log('URL hash:', hash.substring(0, 50) + '...');

        // Let Supabase process the hash and establish session
        // This should automatically exchange recovery/magic link tokens
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Authentication error: ' + sessionError.message);
          return;
        }

        if (session?.user) {
          console.log('✓ Session established for:', session.user.email);
          // User is authenticated, redirect to password reset page or chat
          // For recovery links, they should reset their password
          router.push('/login?reset=true');
        } else {
          console.log('No session found after callback');
          // Try one more time after a short delay
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          
          if (retrySession?.user) {
            console.log('✓ Session established on retry');
            router.push('/login?reset=true');
          } else {
            setError('No valid session. Link may have expired.');
            setTimeout(() => router.push('/login'), 2000);
          }
        }
      } catch (err: any) {
        console.error('Callback error:', err);
        setError('Error: ' + (err?.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        {loading ? (
          <>
            <div className="loading-logo-ring mb-5">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Processing...</h2>
            <p className="text-sm text-muted">Completing your authentication...</p>
          </>
        ) : error ? (
          <>
            <h2 className="text-lg font-semibold text-danger mb-2">Error</h2>
            <p className="text-sm text-muted mb-4">{error}</p>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              Go to Home
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-foreground mb-2">Welcome!</h2>
            <p className="text-sm text-muted">Redirecting to chat...</p>
          </>
        )}
      </div>
    </div>
  );
}
