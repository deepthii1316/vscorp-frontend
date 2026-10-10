import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/middleware/auth';
import { ASSET_COLUMNS, toAsset, inRegisterOrder, cleanAsset, isUuid } from '@/lib/assetShared';

// GET  /api/assets?store=<id> — everything the Assets page needs:
//        stores      every store assets are kept for
//        store       the one being shown (the one asked for, else the first)
//        assets      that store's register (public.store_assets with item and category names)
//        categories, items   the master lists, for the suggestions in the Add form
//        lastImport  the latest Excel import for that store
// POST /api/assets — add one asset to a store: body { store_id, category, item, brand,
//        specification, quantity, remark }. A new category or item name is created
//        (public.asset_add); a store can hold an item only once.
// Admin only.

export const dynamic = 'force-dynamic';

const PAGE = 1000; // PostgREST row cap per request

async function readAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const supabase = createServerClient();
    const asked = new URL(request.url).searchParams.get('store');
    const stores = await readAll(() => supabase.from('asset_stores').select('id, name, code').order('name').order('id'));
    const store = stores.find((s) => s.id === asked) || stores[0] || null;

    const [assets, categories, items, imports] = await Promise.all([
      store ? readAll(() => supabase.from('store_assets').select(ASSET_COLUMNS).eq('store_id', store.id).order('id')) : [],
      readAll(() => supabase.from('asset_categories').select('id, name').order('display_order').order('name').order('id')),
      readAll(() => supabase.from('asset_items').select('id, category_id, name').order('display_order').order('name').order('id')),
      store ? supabase.from('asset_imports').select('file_name, sheet_name, inserted, updated, by_email, at').eq('store_id', store.id).order('at', { ascending: false }).limit(1) : { data: [] },
    ]);
    if (imports.error) throw new Error(`asset_imports: ${imports.error.message}`);

    return NextResponse.json({
      success: true, stores, store,
      assets: inRegisterOrder(assets.map(toAsset)),
      categories, items,
      lastImport: imports.data?.[0] || null,
    });
  } catch (err) {
    console.error('Assets API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!isUuid(body?.store_id)) return NextResponse.json({ success: false, error: 'Choose a store first.' }, { status: 400 });
    const { asset, error: invalid } = cleanAsset(body);
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });

    const { data, error } = await createServerClient().rpc('asset_add', {
      p_store: body.store_id, p_category: asset.category, p_item: asset.item, p_brand: asset.brand,
      p_specification: asset.specification, p_quantity: asset.quantity, p_remark: asset.remark, p_email: auth.user.email || null,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ success: false, error: `This store already has "${asset.item}" under ${asset.category}. Change that row instead.` }, { status: 409 });
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, id: data });
  } catch (err) {
    console.error('Asset add error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
