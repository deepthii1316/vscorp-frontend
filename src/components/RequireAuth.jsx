'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function RequireAuth({ children }) {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login');
    }
  }, [ready, isAuthenticated, router]);

  if (!ready) return <FullPageLoader />;
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
