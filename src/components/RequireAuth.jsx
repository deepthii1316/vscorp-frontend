'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <FullPageLoader />;

  return children;
}

function FullPageLoader() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: 'var(--bg)',
      zIndex: 100,
    }}>
      <div className="skeleton skeleton-logo" />
      <div className="skeleton skeleton-line" style={{ width: 180 }} />
      <div className="skeleton skeleton-line" style={{ width: 120, height: 10 }} />
    </div>
  );
}
