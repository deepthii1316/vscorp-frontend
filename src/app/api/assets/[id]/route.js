import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { cleanAsset, isUuid } from '@/lib/assetShared';

// PATCH  /api/assets/<id> — change an asset's brand, specification, quantity and remark
//          (body, JSON). Which item it is cannot be changed: delete the row and add the right one.
// DELETE /api/assets/<id> — remove the asset from its store. The item stays in the master list.
// Admin only.

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ success: false, error: 'Invalid asset.' }, { status: 400 });
    const { asset, error: invalid } = cleanAsset(await request.json().catch(() => null), { names: false });
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

    const { data, error } = await createServerClient().from('store_assets')
      .update({ ...asset, updated_at: new Date().toISOString(), updated_by_email: auth.user.email || null })
      .eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ success: false, error: 'This asset no longer exists. Refresh the page.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Asset edit error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ success: false, error: 'Invalid asset.' }, { status: 400 });
    const { data, error } = await createServerClient().from('store_assets').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) return NextResponse.json({ success: false, error: 'This asset no longer exists. Refresh the page.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Asset delete error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
