import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function requireAuth(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: { user }, error } = await createServerClient().auth.getUser(match[1]);
  if (error || !user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, response: null };
}