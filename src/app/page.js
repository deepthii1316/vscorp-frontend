'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { isAuthenticated, loading, role, roleLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (roleLoading) return;
    // store_manager has no access to /upload; send each role to its own home page.
    router.replace(role === 'store_manager' ? '/reebok-reports' : '/upload');
  }, [loading, isAuthenticated, role, roleLoading, router]);

  return (
    <div style={{ padding: '48px', color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );
}
