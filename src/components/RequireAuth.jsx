'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/**
 * Wrap a page with this. Pass roles=['admin'] or ['admin','store_manager'] to
 * also gate by role (UI-only - every route that returns data re-checks the
 * role server-side via requireAuth, so this can never be the real barrier).
 * Omit roles for auth-only pages (any logged-in user).
 */
export default function RequireAuth({ children, roles }) {
  const { isAuthenticated, loading, role, roleLoading } = useAuth();
  const router = useRouter();

  const roleChecked = !roles || !roleLoading;
  const roleMismatch = roles && role && !roles.includes(role);

  useEffect(() => {
    if (loading || !roleChecked) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    if (roleMismatch) router.replace('/reebok-reports'); // the one page every role can reach
  }, [loading, isAuthenticated, roleChecked, roleMismatch, router]);

  if (loading || !roleChecked) return <FullPageLoader />;
  if (!isAuthenticated) return <FullPageLoader />;
  if (roleMismatch) return <FullPageLoader />; // about to redirect
  if (roles && !role) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Your account has no role assigned yet. Ask an admin to set one up.
      </div>
    );
  }

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
