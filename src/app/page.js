'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(isAuthenticated ? '/upload' : '/login');
  }, [ready, isAuthenticated, router]);

  return (
    <div style={{ padding: '48px', color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );
}
