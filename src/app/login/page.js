'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';

export default function LoginPage() {
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/upload');
    }
  }, [isAuthenticated, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      setErr(error.message || 'Login failed');
      return;
    }
    router.replace('/upload');
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-logo">
          <Image src="/virata-logo.png" alt="Virata Retail" width={48} height={48} priority />
        </div>
        <h1 className="login-title">Virata Retail</h1>
        <p className="login-sub">Sign in to access retail operations</p>

        <form onSubmit={onSubmit} className="login-form">
          <label className="login-label">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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

          <button type="submit" className="login-submit" disabled={busy || authLoading}>
            {busy || authLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-hint">
          <strong>Internal access only</strong>
        </div>
      </div>
    </div>
  );
}
