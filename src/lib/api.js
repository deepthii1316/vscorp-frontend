import { createBrowserClient } from '@/lib/supabase';

export async function apiFetch(input, init = {}) {
  const supabase = createBrowserClient();

  async function requestWithSession(session) {
    const headers = new Headers(init.headers);
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
    return fetch(input, { ...init, headers });
  }

  const { data: { session } } = await supabase.auth.getSession();
  let response = await requestWithSession(session);

  if (response.status === 401) {
    const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
    if (refreshedSession?.access_token) response = await requestWithSession(refreshedSession);
  }

  return response;
}