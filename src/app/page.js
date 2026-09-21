'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? '/upload' : '/login');
  }, [loading, isAuthenticated, router]);

  return (
    <div style={{ padding: '48px', color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );
}
