import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
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