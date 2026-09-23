'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import LogoutButton from '@/components/LogoutButton';
import { Bell } from 'lucide-react';

const ROLE_LABEL = { admin: 'Administrator', store_manager: 'Store Manager' };

function TopBar() {
  const { user, role } = useAuth();
  const initials = (user?.email || 'U').slice(0, 2).toUpperCase();
  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <h2>Virata Retail</h2>
        <span style={{ color: 'var(--border-strong)', margin: '0 4px' }}>·</span>
        <p>Retail Operations</p>
      </div>
      <div className="top-bar-right">
        <button type="button" className="top-bar-icon-btn" title="Notifications" aria-label="Notifications">
          <Bell style={{ width: '15px', height: '15px' }} />
        </button>
        <div className="user-badge">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{user?.email || 'User'}</div>
            <div className="user-role">{ROLE_LABEL[role] || ''}</div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <AuthProvider>
      {isLogin ? (
        children
      ) : (
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <TopBar />
            <div className="page-content">{children}</div>
          </main>
        </div>
      )}
    </AuthProvider>
  );
}
