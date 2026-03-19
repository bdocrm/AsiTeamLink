'use client';

import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function ChatGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.status !== 'approved') {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted text-sm">Loading AsiTeamLink...</p>
        </div>
      </div>
    );
  }

  if (!user || user.status !== 'approved') return null;

  return <>{children}</>;
}

export default function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ChatGuard>
        {children}
      </ChatGuard>
    </AuthProvider>
  );
}
