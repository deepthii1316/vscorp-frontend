import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { cleanStore } from '@/lib/assetShared';

// POST /api/assets/stores — add a store to keep assets for: body { name, code }.
// Names and codes are unique without regard to case. Admin only.

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { store, error: invalid } = cleanStore(await request.json().catch(() => null));
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

    const { data, error } = await createServerClient().from('asset_stores').insert(store).select('id, name, code').single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: 'A store with this name or code already exists.' }, { status: 409 });
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true, store: data });
  } catch (err) {
    console.error('Asset store error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
