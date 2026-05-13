'use client';

import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import AUPModal from '@/components/AUPModal';

function ChatGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [aupDismissed, setAupDismissed] = useState(false);

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
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="loading-logo-ring">
            <Image
              src="/asiteamlinklogo.png"
              alt="AsiTeamLink"
              width={56}
              height={56}
              className="rounded-2xl"
              priority
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-lg font-bold gradient-brand-text">AsiTeamLink</h2>
            <div className="flex items-center gap-2">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.status !== 'approved') return null;

  // Show AUP only after the column exists (null = exists but not accepted, undefined = column not yet in DB)
  const needsAUP = !aupDismissed && user.aup_accepted_at === null;

  const handleAUPAccept = async () => {
    await fetch('/api/auth/accept-aup', { method: 'POST' });
    await refreshUser();
    setAupDismissed(true);
  };

  return (
    <>
      {needsAUP && (
        <AUPModal
          userName={user.full_name ?? user.name ?? user.email}
          onAccept={handleAUPAccept}
        />
      )}
      {children}
    </>
  );
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
