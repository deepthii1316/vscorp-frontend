'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Role/store are UI-only conveniences (which nav items and pages to show).
  // Every route that actually returns data re-checks the role server-side.
  const [role, setRole] = useState(null);
  const [storeSiteShortName, setStoreSiteShortName] = useState(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();
    let active = true;

    const loadRole = async (currentSession) => {
      if (!currentSession) {
        if (active) { setRole(null); setStoreSiteShortName(null); setRoleLoading(false); }
        return;
      }
      const { data } = await supabase.from('users').select('role, store_site_short_name').eq('id', currentSession.user.id).single();
      if (active) {
        setRole(data?.role || null);
        setStoreSiteShortName(data?.store_site_short_name || null);
        setRoleLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (active) {
        setSession(currentSession);
        setLoading(false);
      }
      loadRole(currentSession);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setRoleLoading(true);
      loadRole(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const supabase = createBrowserClient();
  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp = (email, password) => supabase.auth.signUp({ email, password });
  const signOut = () => supabase.auth.signOut();
  const user = session?.user || null;

  return (
    <AuthContext.Provider value={{
      session,
      user,
      loading,
      signIn,
      signUp,
      signOut,
      ready: !loading,
      isAuthenticated: !!session,
      role,
      storeSiteShortName,
      roleLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
