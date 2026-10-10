import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    // ?sha256=<hex> — the Upload page's early duplicate check (the upload route re-checks on POST).
    const sha256 = new URL(request.url).searchParams.get('sha256');
    if (sha256) {
      if (!/^[0-9a-f]{64}$/i.test(sha256)) return NextResponse.json({ error: 'Invalid sha256.' }, { status: 400 });
      const { data, error } = await createServerClient()
        .from('upload_audit_log')
        .select('*')
        .eq('file_sha256', sha256.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ duplicate: data || null });
    }

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