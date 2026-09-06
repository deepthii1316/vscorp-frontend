'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/upload');
    }
  }, [isAuthenticated, router]);

  const onSubmit = (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const res = login(username, password);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || 'Login failed');
      return;
    }
    router.replace('/upload');
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <Image src="/logo.png" alt="VS Corp" width={48} height={48} priority />
        </div>
        <h1 className="login-title">VS Corp</h1>
        <p className="login-sub">Sign in to access retail operations</p>

        <form onSubmit={onSubmit} className="login-form">
          <label className="login-label">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </label>
          <label className="login-label">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {err && <div className="login-err">{err}</div>}

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-hint">
          <strong>Internal access only</strong>
          {/* <div>admin / vscorp2026 · manager / reebok2026 · merch / merch2026</div> */}
        </div>
      </div>
    </div>
  );
}
