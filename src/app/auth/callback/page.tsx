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
        // Let Supabase automatically parse the URL fragment and establish session
        // This handles recovery links, magiclinks, and oauth redirects
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setError('Authentication error: ' + error.message);
          return;
        }

        if (session) {
          // Session is established, redirect to chat
          console.log('Session established, redirecting to chat');
          router.push('/chat');
        } else {
          // No session established yet
          console.log('No session, waiting or redirecting home');
          setTimeout(() => {
            router.push('/');
          }, 1000);
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
