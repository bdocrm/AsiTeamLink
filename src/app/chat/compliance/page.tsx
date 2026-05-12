'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OldCompliancePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/compliance');
  }, [router]);

  return null;
}
