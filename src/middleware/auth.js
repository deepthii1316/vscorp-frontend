import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Verifies the Bearer token, and (when allowedRoles is given) checks the
 * caller's role from public.users. Pass allowedRoles = ['admin'] or
 * ['admin', 'store_manager'] to gate a route; omit it for auth-only routes.
 * Always checked server-side - a client-side role check is for UI only.
 */
export async function requireAuth(request, allowedRoles = null) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return { user: null, role: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(match[1]);
  if (error || !user) {
    return { user: null, role: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!allowedRoles) {
    return { user, role: null, response: null };
  }

  const { data: profile } = await supabase.from('users').select('role, store_site_short_name').eq('id', user.id).single();
  if (!profile || !allowedRoles.includes(profile.role)) {
    return { user, role: profile?.role || null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role, storeSiteShortName: profile.store_site_short_name, response: null };
}
