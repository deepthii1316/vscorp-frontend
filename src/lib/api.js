import { createBrowserClient } from '@/lib/supabase';

export async function apiFetch(input, init = {}) {
  const { data: { session } } = await createBrowserClient().auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  return fetch(input, { ...init, headers });
}