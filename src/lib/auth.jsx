// lib/auth.jsx — Simple auth context for the app.
// Uses hardcoded credentials (single-tenant, internal tool) for now.

'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// Hardcoded credentials — these are the only allowed users.
// Both passwords are 6+ characters and meet basic complexity.
const ALLOWED_USERS = [
  {
    id:       'u_admin',
    username: 'admin',
    password: 'vscorp2026',
    name:     'Admin',
    role:     'Administrator',
  },
  {
    id:       'u_manager',
    username: 'manager',
    password: 'reebok2026',
    name:     'Store Manager',
    role:     'Store Manager',
  },
  {
    id:       'u_merch',
    username: 'merch',
    password: 'merch2026',
    name:     'Merchandiser',
    role:     'Merchandiser',
  },
];

const AuthContext = createContext(null);
const STORAGE_KEY = 'vscorp_auth_v1';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.user) setUser(parsed.user);
      }
    } catch {}
    setReady(true);
  }, []);

  const login = useCallback((username, password) => {
    const found = ALLOWED_USERS.find(
      (u) => u.username === String(username).trim().toLowerCase() && u.password === password
    );
    if (!found) return { ok: false, error: 'Invalid username or password' };
    const sessionUser = { id: found.id, username: found.username, name: found.name, role: found.role };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: sessionUser })); } catch {}
    setUser(sessionUser);
    return { ok: true, user: sessionUser };
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
