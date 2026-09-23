import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { data, error } = await createServerClient()
      .from('upload_audit_log')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ uploads: data || [] });
  } catch (error) {
    console.error('Upload history API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load upload history.' }, { status: 500 });
  }
}